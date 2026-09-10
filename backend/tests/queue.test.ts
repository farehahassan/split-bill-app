import { describe, it, expect, vi } from "vitest";

import { loadEnv } from "../src/config/env.js";
import { buildQueueConfig, JobQueue, type JobQueueConfig } from "../src/queues/jobQueue.js";
import { JOB_TYPES } from "../src/queues/job.types.js";
import { FakeRedis, FailingRedis } from "./helpers/fakeRedis.js";

const TYPE = JOB_TYPES.GROUP_SUMMARY_RECOMPUTE;
const QUEUE_KEY = `job:queue:${TYPE}`;

function makeConfig(overrides: Partial<JobQueueConfig> = {}): JobQueueConfig {
  return {
    maxAttempts: 5,
    baseBackoffMs: 100,
    maxBackoffMs: 1000,
    leaseMs: 1000,
    payloadTtlMs: 86400000,
    ...overrides,
  };
}

function makeQueue(redis: FakeRedis, overrides: Partial<JobQueueConfig> = {}): JobQueue {
  return new JobQueue(redis, makeConfig(overrides));
}

function zsetMemberCount(redis: FakeRedis): number {
  return redis.zsets.get(QUEUE_KEY)?.length ?? 0;
}

function storedPayload(redis: FakeRedis, jobId: string): Record<string, unknown> | null {
  const raw = redis.store.get(`job:data:${jobId}`)?.value;
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
}

function inflightValue(redis: FakeRedis, jobId: string): string | undefined {
  return redis.store.get(`job:inflight:${jobId}`)?.value;
}

describe("JobQueue.enqueue", () => {
  it("queues a job with a payload key and a TTL-bounded lease-free membership", async () => {
    const redis = new FakeRedis();
    const queue = makeQueue(redis);

    const envelope = await queue.enqueue(TYPE, { groupId: "group-1" });

    expect(envelope).toMatchObject({ type: TYPE, attempts: 0 });
    expect(typeof envelope.jobId).toBe("string");
    expect(redis.zsets.get(QUEUE_KEY)).toHaveLength(1);
    expect(storedPayload(redis, envelope.jobId)?.payload).toEqual({ groupId: "group-1" });
    const dataEntry = redis.store.get(`job:data:${envelope.jobId}`);
    expect(dataEntry?.expiresAt).not.toBeNull();
  });

  it("stores the earliest next-attempt score so the claim order is by schedule", async () => {
    const redis = new FakeRedis();
    const queue = makeQueue(redis);
    const now = Date.now();

    const first = await queue.enqueue(TYPE, { groupId: "group-1" }, { scheduledFor: now + 1000 });
    const second = await queue.enqueue(TYPE, { groupId: "group-2" }, { scheduledFor: now });

    const jobs = redis.zsets.get(QUEUE_KEY) ?? [];
    expect(jobs.map((job) => job.member).sort()).toEqual([first.jobId, second.jobId].sort());
    expect(jobs.find((job) => job.member === second.jobId)?.score).toBeLessThan(
      jobs.find((job) => job.member === first.jobId)?.score as number,
    );
  });

  it("propagates the optional request id into the stored envelope", async () => {
    const redis = new FakeRedis();
    const queue = makeQueue(redis);

    const envelope = await queue.enqueue(TYPE, { groupId: "group-1" }, { requestId: "req-123" });

    expect(storedPayload(redis, envelope.jobId)?.requestId).toBe("req-123");
  });

  it("rejects an unknown job type instead of queueing garbage", async () => {
    const redis = new FakeRedis();
    const queue = makeQueue(redis);

    await expect(queue.enqueue("NOT_A_REAL_JOB" as never, { groupId: "group-1" })).rejects.toThrow(
      "Unknown job type",
    );
    expect(zsetMemberCount(redis)).toBe(0);
  });

  it("leaves the ZSET untouched when the payload write fails", async () => {
    const redis = new FakeRedis();
    const queue = makeQueue(redis);
    vi.spyOn(redis, "set").mockRejectedValueOnce(new Error("Connection is closed."));

    await expect(queue.enqueue(TYPE, { groupId: "group-1" })).rejects.toThrow(
      "Connection is closed.",
    );
    expect(zsetMemberCount(redis)).toBe(0);
  });
});

describe("JobQueue.claimNext", () => {
  it("returns empty when nothing is due", async () => {
    const redis = new FakeRedis();
    const queue = makeQueue(redis);

    await expect(queue.claimNext(TYPE)).resolves.toEqual({ kind: "empty" });
  });

  it("does not claim a job that is scheduled for the future", async () => {
    const redis = new FakeRedis();
    const queue = makeQueue(redis);
    await queue.enqueue(TYPE, { groupId: "group-1" }, { scheduledFor: Date.now() + 60_000 });

    await expect(queue.claimNext(TYPE)).resolves.toEqual({ kind: "empty" });
  });

  it("claims the earliest due job and returns its envelope", async () => {
    const redis = new FakeRedis();
    const queue = makeQueue(redis);
    const now = Date.now();
    const later = await queue.enqueue(TYPE, { groupId: "later" }, { scheduledFor: now + 10_000 });
    const earlier = await queue.enqueue(TYPE, { groupId: "earlier" }, { scheduledFor: now - 10 });

    const result = await queue.claimNext(TYPE);

    expect(result).toMatchObject({ kind: "claimed", jobId: earlier.jobId });
    if (result.kind !== "claimed") return;
    expect(result.envelope.payload).toEqual({ groupId: "earlier" });
    expect(result.jobId).toBe(earlier.jobId);
    expect(inflightValue(redis, earlier.jobId)).toBeTypeOf("string");
    // The queued member stays in the set until the job is completed.
    expect(zsetMemberCount(redis)).toBe(2);
    expect(redis.zsets.get(QUEUE_KEY)?.some((job) => job.member === later.jobId)).toBe(true);
  });

  it("reports busy while another worker holds the in-flight lease", async () => {
    const redis = new FakeRedis();
    const queue = makeQueue(redis);
    const envelope = await queue.enqueue(TYPE, { groupId: "group-1" });

    const first = await queue.claimNext(TYPE);
    expect(first.kind).toBe("claimed");

    const second = await queue.claimNext(TYPE);
    expect(second.kind).toBe("busy");
    expect(redis.store.has(`job:inflight:${envelope.jobId}`)).toBe(true);
  });

  it("reclaims a job after its lease has expired", async () => {
    const redis = new FakeRedis();
    const queue = makeQueue(redis, { leaseMs: 20 });
    const envelope = await queue.enqueue(TYPE, { groupId: "group-1" });

    expect((await queue.claimNext(TYPE)).kind).toBe("claimed");

    await new Promise((resolve) => setTimeout(resolve, 40));

    const retry = await queue.claimNext(TYPE);
    expect(retry).toMatchObject({ kind: "claimed", jobId: envelope.jobId });
  });

  it("discards and reports malformed when the payload has expired", async () => {
    const redis = new FakeRedis();
    const queue = makeQueue(redis);
    const envelope = await queue.enqueue(TYPE, { groupId: "group-1" });
    redis.store.delete(`job:data:${envelope.jobId}`);

    const result = await queue.claimNext(TYPE);

    expect(result).toEqual({ kind: "malformed", jobId: envelope.jobId });
    expect(zsetMemberCount(redis)).toBe(0);
    expect(redis.store.has(`job:inflight:${envelope.jobId}`)).toBe(false);
  });

  it("discards and reports malformed for an unparseable or mismatched payload", async () => {
    const redis = new FakeRedis();
    const queue = makeQueue(redis);
    const envelope = await queue.enqueue(TYPE, { groupId: "group-1" });

    redis.store.set(`job:data:${envelope.jobId}`, {
      value: "{not json",
      expiresAt: Date.now() + 60_000,
    });
    await expect(queue.claimNext(TYPE)).resolves.toMatchObject({
      kind: "malformed",
      jobId: envelope.jobId,
    });

    const second = await queue.enqueue(TYPE, { groupId: "group-2" });
    redis.store.set(`job:data:${second.jobId}`, {
      value: JSON.stringify({
        jobId: second.jobId,
        type: "SOME_OTHER_TYPE",
        payload: {},
        attempts: 0,
        createdAt: new Date().toISOString(),
      }),
      expiresAt: Date.now() + 60_000,
    });
    await expect(queue.claimNext(TYPE)).resolves.toMatchObject({
      kind: "malformed",
      jobId: second.jobId,
    });
  });
});

describe("JobQueue completion and retry", () => {
  it("complete() removes the job from the queue, payload, and lease", async () => {
    const redis = new FakeRedis();
    const queue = makeQueue(redis);
    const envelope = await queue.enqueue(TYPE, { groupId: "group-1" });
    await queue.claimNext(TYPE);

    await queue.complete(TYPE, envelope.jobId);

    expect(zsetMemberCount(redis)).toBe(0);
    expect(redis.store.has(`job:data:${envelope.jobId}`)).toBe(false);
    expect(redis.store.has(`job:inflight:${envelope.jobId}`)).toBe(false);
  });

  it("retryAfterFailure() rewrites attempts, applies backoff, and clears the lease", async () => {
    const redis = new FakeRedis();
    const queue = makeQueue(redis);
    const envelope = await queue.enqueue(TYPE, { groupId: "group-1" });
    await queue.claimNext(TYPE);
    const before = Date.now();

    await queue.retryAfterFailure(TYPE, envelope.jobId, 1, 500);

    const member = redis.zsets.get(QUEUE_KEY)?.find((job) => job.member === envelope.jobId);
    expect(member).toBeDefined();
    expect((member?.score as number) - before).toBeGreaterThanOrEqual(480);
    expect(storedPayload(redis, envelope.jobId)?.attempts).toBe(1);
    expect(redis.store.has(`job:inflight:${envelope.jobId}`)).toBe(false);
    // Not schedulable yet because of the backoff window.
    await expect(queue.claimNext(TYPE)).resolves.toEqual({ kind: "empty" });
  });

  it("retryAfterFailure() drops stale membership when the payload already expired", async () => {
    const redis = new FakeRedis();
    const queue = makeQueue(redis);
    const envelope = await queue.enqueue(TYPE, { groupId: "group-1" });
    redis.store.delete(`job:data:${envelope.jobId}`);

    await queue.retryAfterFailure(TYPE, envelope.jobId, 1, 100);

    expect(zsetMemberCount(redis)).toBe(0);
    expect(redis.store.has(`job:inflight:${envelope.jobId}`)).toBe(false);
  });

  it("discard() removes every artifact", async () => {
    const redis = new FakeRedis();
    const queue = makeQueue(redis);
    const envelope = await queue.enqueue(TYPE, { groupId: "group-1" });
    await queue.claimNext(TYPE);

    await queue.discard(TYPE, envelope.jobId);

    expect(zsetMemberCount(redis)).toBe(0);
    expect(redis.store.has(`job:data:${envelope.jobId}`)).toBe(false);
    expect(redis.store.has(`job:inflight:${envelope.jobId}`)).toBe(false);
  });

  it("backoffFor() grows exponentially and never exceeds the cap", () => {
    const queue = new JobQueue(
      new FakeRedis(),
      makeConfig({ baseBackoffMs: 100, maxBackoffMs: 500 }),
    );

    expect(queue.backoffFor(1)).toBe(100);
    expect(queue.backoffFor(2)).toBe(200);
    expect(queue.backoffFor(3)).toBe(400);
    expect(queue.backoffFor(10)).toBe(500);
  });
});

describe("JobQueue resilience", () => {
  it("propagates Redis write failures from enqueue through claim", async () => {
    const redis = new FailingRedis();
    const queue = makeQueue(redis);

    await expect(queue.enqueue(TYPE, { groupId: "group-1" })).rejects.toThrow();
    await expect(queue.claimNext(TYPE)).rejects.toThrow();
  });
});

describe("buildQueueConfig", () => {
  it("maps the env defaults into the queue config", () => {
    const config = buildQueueConfig(loadEnv());

    expect(config).toEqual({
      maxAttempts: 5,
      baseBackoffMs: 2000,
      maxBackoffMs: 60000,
      leaseMs: 30000,
      payloadTtlMs: 86400000,
    });
  });
});
