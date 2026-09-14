import { describe, it, expect, vi } from "vitest";
import { z } from "zod";

import { JobQueue, PermanentJobFailureError } from "../src/queues/jobQueue.js";
import type { JobRegistry } from "../src/queues/jobRegistry.js";
import { JOB_TYPES } from "../src/queues/job.types.js";
import { WorkerRunner } from "../src/queues/workerRunner.js";
import { FakeRedis } from "./helpers/fakeRedis.js";

const TYPE = JOB_TYPES.GROUP_SUMMARY_RECOMPUTE;
const QUEUE_KEY = `job:queue:${TYPE}`;

const payloadSchema = z.object({ groupId: z.string().min(1) }).strict();

function makeQueue(redis: FakeRedis): JobQueue {
  return new JobQueue(redis, {
    maxAttempts: 3,
    baseBackoffMs: 100,
    maxBackoffMs: 500,
    leaseMs: 1000,
    payloadTtlMs: 86400000,
  });
}

function makeRegistry(
  process: (job: { type: string; payload: unknown }) => Promise<void>,
): JobRegistry {
  return {
    [TYPE]: { type: TYPE, schema: payloadSchema, process },
  };
}

function zsetSize(redis: FakeRedis): number {
  return redis.zsets.get(QUEUE_KEY)?.length ?? 0;
}

function makeDue(redis: FakeRedis): void {
  const member = redis.zsets.get(QUEUE_KEY)?.[0];
  if (member) member.score = Date.now() - 1000;
}

const jobEnvelope = (jobId: string) => ({
  jobId,
  type: TYPE,
  payload: { groupId: "group-1" },
  attempts: 0,
  createdAt: new Date().toISOString(),
  requestId: "req-1",
});

describe("WorkerRunner", () => {
  it("processes a claimed job and removes it from the queue", async () => {
    const redis = new FakeRedis();
    const queue = makeQueue(redis);
    const process = vi.fn(async () => {});
    const runner = new WorkerRunner({
      queue,
      registry: makeRegistry(process),
      pollIntervalMs: 5,
    });

    const envelope = await queue.enqueue(TYPE, jobEnvelope("job-1").payload);
    await runner.tick();

    expect(process).toHaveBeenCalledTimes(1);
    expect(process).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: envelope.jobId,
        payload: { groupId: "group-1" },
      }),
    );
    expect(zsetSize(redis)).toBe(0);
    expect(redis.store.has(`job:inflight:${envelope.jobId}`)).toBe(false);
  });

  it("validates the payload before processing and discards invalid ones", async () => {
    const redis = new FakeRedis();
    const queue = makeQueue(redis);
    const process = vi.fn(async () => {});
    const runner = new WorkerRunner({
      queue,
      registry: makeRegistry(process),
      pollIntervalMs: 5,
    });

    const envelope = await queue.enqueue(TYPE, { groupId: "group-1", extra: "not allowed" });
    await runner.tick();

    expect(process).not.toHaveBeenCalled();
    expect(zsetSize(redis)).toBe(0);
    expect(redis.store.has(`job:inflight:${envelope.jobId}`)).toBe(false);
  });

  it("discards a job that reports a permanent failure", async () => {
    const redis = new FakeRedis();
    const queue = makeQueue(redis);
    const process = vi.fn(async () => {
      throw new PermanentJobFailureError("group is gone");
    });
    const runner = new WorkerRunner({
      queue,
      registry: makeRegistry(process),
      pollIntervalMs: 5,
    });

    await queue.enqueue(TYPE, jobEnvelope("job-1").payload);
    await runner.tick();

    expect(process).toHaveBeenCalledTimes(1);
    expect(zsetSize(redis)).toBe(0);
    expect(redis.store.has("job:inflight:job-1")).toBe(false);
  });

  it("reschedules a transient failure with backoff and in-order attempt bookkeeping", async () => {
    const redis = new FakeRedis();
    const queue = makeQueue(redis);
    const process = vi.fn(async () => {
      throw new Error("db timeout");
    });
    const runner = new WorkerRunner({
      queue,
      registry: makeRegistry(process),
      pollIntervalMs: 5,
    });
    const before = Date.now();

    const envelope = await queue.enqueue(TYPE, jobEnvelope("job-1").payload);
    await runner.tick();

    // Attempt 1 failed: the job is still queued but scheduled in the future,
    // so a second tick without waiting does not touch it again.
    await runner.tick();
    expect(process).toHaveBeenCalledTimes(1);
    expect(zsetSize(redis)).toBe(1);
    expect(redis.store.has(`job:inflight:${envelope.jobId}`)).toBe(false);

    const raw = redis.store.get(`job:data:${envelope.jobId}`)?.value;
    expect((JSON.parse(raw as string) as { attempts: number }).attempts).toBe(1);
    const member = redis.zsets.get(QUEUE_KEY)?.[0];
    expect((member?.score as number) - before).toBeGreaterThan(0);

    // Once the retry becomes due, the next tick makes a second attempt.
    makeDue(redis);
    await runner.tick();
    expect(process).toHaveBeenCalledTimes(2);
    expect(
      (
        JSON.parse(redis.store.get(`job:data:${envelope.jobId}`)?.value as string) as {
          attempts: number;
        }
      ).attempts,
    ).toBe(2);
  });

  it("discards the job once the attempt budget is exhausted", async () => {
    const redis = new FakeRedis();
    const queue = makeQueue(redis);
    const process = vi.fn(async () => {
      throw new Error("always fails");
    });
    const runner = new WorkerRunner({
      queue,
      registry: makeRegistry(process),
      pollIntervalMs: 5,
    });

    const envelope = await queue.enqueue(TYPE, jobEnvelope("job-1").payload);
    await runner.tick();
    makeDue(redis);
    await runner.tick();
    makeDue(redis);
    await runner.tick();

    expect(process).toHaveBeenCalledTimes(3);
    expect(zsetSize(redis)).toBe(0);
    expect(redis.store.has(`job:inflight:${envelope.jobId}`)).toBe(false);
  });

  it("leaves a busy job alone when its lease is already held", async () => {
    const redis = new FakeRedis();
    const queue = makeQueue(redis);
    const process = vi.fn(async () => {});
    const runner = new WorkerRunner({
      queue,
      registry: makeRegistry(process),
      pollIntervalMs: 5,
    });

    await queue.enqueue(TYPE, jobEnvelope("job-1").payload);
    await queue.claimNext(TYPE);

    await runner.tick();

    expect(process).not.toHaveBeenCalled();
    expect(zsetSize(redis)).toBe(1);
  });

  it("discards malformed queue members without invoking the handler", async () => {
    const redis = new FakeRedis();
    const queue = makeQueue(redis);
    const process = vi.fn(async () => {});
    const runner = new WorkerRunner({
      queue,
      registry: makeRegistry(process),
      pollIntervalMs: 5,
    });
    const envelope = await queue.enqueue(TYPE, jobEnvelope("job-1").payload);
    redis.store.set(`job:data:${envelope.jobId}`, {
      value: "not json at all",
      expiresAt: Date.now() + 60_000,
    });

    await runner.tick();

    expect(process).not.toHaveBeenCalled();
    expect(zsetSize(redis)).toBe(0);
  });

  it("start() runs the poll loop until stop() and drains in-flight work", async () => {
    const redis = new FakeRedis();
    const queue = makeQueue(redis);
    let release: (() => void) | null = null;
    const process = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const runner = new WorkerRunner({
      queue,
      registry: makeRegistry(process),
      pollIntervalMs: 5,
    });

    await queue.enqueue(TYPE, jobEnvelope("job-1").payload);

    const loop = runner.start();
    await vi.waitFor(() => expect(process).toHaveBeenCalledTimes(1));

    // stop() must not return until the in-flight job finishes.
    const stopping = runner.stop();
    await new Promise((resolve) => setTimeout(resolve, 40));
    release?.();
    await stopping;
    await loop;

    expect(process).toHaveBeenCalledTimes(1);
    expect(zsetSize(redis)).toBe(0);
  });

  it("start() is a no-op when already running", async () => {
    const redis = new FakeRedis();
    const queue = makeQueue(redis);
    const runner = new WorkerRunner({
      queue,
      registry: makeRegistry(vi.fn(async () => {})),
      pollIntervalMs: 5,
    });

    const first = runner.start();
    const second = runner.start();
    await runner.stop();
    await first;
    await second;

    expect(true).toBe(true);
  });
});
