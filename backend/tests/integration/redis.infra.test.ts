import { describe, expect, it } from "vitest";

import { JobQueue } from "../../src/queues/jobQueue.js";
import { JOB_TYPES } from "../../src/queues/job.types.js";
import { RedisCacheStore } from "../../src/redis/cacheStore.js";
import { DistributedLock } from "../../src/redis/distributedLock.js";
import { RedisRateLimitStore } from "../../src/redis/rateLimitStore.js";
import { getRedis } from "../../src/redis/redisClient.js";
import { testRedisClient } from "./helpers/redis.js";
import { waitFor } from "./helpers/waitFor.js";

const redis = getRedis();

describe("Redis primitives against a live Redis", () => {
  it("RedisCacheStore stores, reads, and deletes values with a TTL", async () => {
    const store = new RedisCacheStore(redis);
    const key = "cache:test:entry";

    expect(await store.get(key)).toBeNull();

    await store.set(key, "value-1", 300);
    expect(await store.get(key)).toBe("value-1");

    const ttl = await testRedisClient().pttl(key);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(300_000);

    await store.delete(key);
    expect(await store.get(key)).toBeNull();
  });

  it("RedisRateLimitStore runs its Lua counter script and expires the window", async () => {
    const prefix = "rl:test:";
    const key = "127.0.0.1";
    const windowMs = 200;
    const store = new RedisRateLimitStore({ redis, prefix, windowMs });

    const fullKey = `${prefix}${key}`;
    expect(await testRedisClient().get(fullKey)).toBeNull();

    const first = await store.increment(key);
    expect(first.totalHits).toBe(1);
    expect(first.resetTime).toBeInstanceOf(Date);
    expect(first.resetTime!.getTime()).toBeGreaterThan(Date.now());

    const second = await store.increment(key);
    expect(second.totalHits).toBe(2);

    // The "PX" TTL was set on the first hit, so the key sheds automatically.
    await waitFor(() => testRedisClient().get(fullKey).then((value) => value === null), {
      timeoutMs: 3000,
      description: "rate-limit window expiry",
    });

    const restarted = await store.increment(key);
    expect(restarted.totalHits).toBe(1);

    // decrement and resetKey shape the final key state.
    await store.increment(key);
    await store.decrement(key);
    await store.resetKey(key);
    expect(await testRedisClient().get(fullKey)).toBeNull();
  });

  it("DistributedLock uses NX + ownership-safe release against real Redis", async () => {
    const lock = new DistributedLock(getRedis(), 5_000);
    const key = "lock:test:resource";

    const firstToken = await lock.acquire(key);
    expect(firstToken).not.toBeNull();
    expect((await testRedisClient().get(key))).toBe(firstToken);

    // A second contender cannot acquire the same lock.
    expect(await lock.acquire(key)).toBeNull();

    // Only the holder can release it.
    expect(await lock.release(key, "wrong-token")).toBe(false);
    expect(await testRedisClient().get(key)).toBe(firstToken);

    expect(await lock.release(key, firstToken!)).toBe(true);
    expect(await testRedisClient().get(key)).toBeNull();

    // After release, a new contender acquires it again.
    expect(await lock.acquire(key)).not.toBeNull();
  });

  it("an expired lock releases on its own via the TTL backstop", async () => {
    const shortLock = new DistributedLock(getRedis(), 100);
    const key = "lock:test:shortlived";

    const token = await shortLock.acquire(key);
    expect(token).not.toBeNull();

    const ttl = await testRedisClient().pttl(key);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(100);

    // Poll until Redis expires the key — no arbitrary sleep.
    await waitFor(() => testRedisClient().get(key).then((value) => value === null), {
      timeoutMs: 3000,
      description: "lock expiry",
    });

    // The resource is now acquirable by anyone.
    expect(await shortLock.acquire(key)).not.toBeNull();
  });

  it("JobQueue enqueues, claims, completes, and drains against real Redis", async () => {
    const queue = new JobQueue(getRedis(), {
      maxAttempts: 5,
      baseBackoffMs: 500,
      maxBackoffMs: 2_000,
      leaseMs: 30_000,
      payloadTtlMs: 60_000,
    });
    const type = JOB_TYPES.GROUP_SUMMARY_RECOMPUTE;

    const envelope = await queue.enqueue(type, { groupId: "not-used-here" });
    const queueKey = `job:queue:${type}`;
    const dataKey = `job:data:${envelope.jobId}`;

    expect((await testRedisClient().zscore(queueKey, envelope.jobId))).not.toBeNull();
    expect(await testRedisClient().pttl(dataKey)).toBeGreaterThan(0);

    const claimed = await queue.claimNext(type);
    expect(claimed.kind).toBe("claimed");
    if (claimed.kind === "claimed") {
      expect(claimed.envelope.jobId).toBe(envelope.jobId);
      expect(claimed.envelope.payload).toEqual({ groupId: "not-used-here" });
    }

    // The in-flight lease prevents a second consumer from claiming it.
    expect((await queue.claimNext(type)).kind).toBe("busy");

    await queue.complete(type, envelope.jobId);
    expect((await queue.claimNext(type)).kind).toBe("empty");
    expect(await testRedisClient().get(dataKey)).toBeNull();
  });

  it("a job scheduled in the future is not claimable; one scheduled in the past is", async () => {
    const queue = new JobQueue(getRedis(), {
      maxAttempts: 5,
      baseBackoffMs: 500,
      maxBackoffMs: 2_000,
      leaseMs: 30_000,
      payloadTtlMs: 60_000,
    });
    const type = JOB_TYPES.GROUP_SUMMARY_RECOMPUTE;

    const future = await queue.enqueue(type, { groupId: "future" }, {
      scheduledFor: Date.now() + 100_000,
    });
    expect((await queue.claimNext(type)).kind).toBe("empty");
    await queue.discard(type, future.jobId);

    const past = await queue.enqueue(type, { groupId: "past" }, {
      scheduledFor: Date.now() - 1_000,
    });
    const claimed = await queue.claimNext(type);
    expect(claimed.kind).toBe("claimed");
    if (claimed.kind === "claimed") expect(claimed.envelope.jobId).toBe(past.jobId);
    await queue.complete(type, past.jobId);
  });

  it("retryAfterFailure re-schedules the payload with the requested backoff delay", async () => {
    const type = JOB_TYPES.GROUP_SUMMARY_RECOMPUTE;
    const queue = new JobQueue(getRedis(), {
      maxAttempts: 5,
      baseBackoffMs: 500,
      maxBackoffMs: 2_000,
      leaseMs: 30_000,
      payloadTtlMs: 60_000,
    });

    const envelope = await queue.enqueue(type, { groupId: "retry" });
    const carried = await queue.claimNext(type);
    expect(carried.kind).toBe("claimed");

    await queue.retryAfterFailure(type, envelope.jobId, 1, 1_000);

    // The member is still queued, scored roughly at now + delay.
    const zscore = Number(await testRedisClient().zscore(`job:queue:${type}`, envelope.jobId));
    expect(zscore).toBeGreaterThan(Date.now());
    expect(zscore).toBeLessThanOrEqual(Date.now() + 2_000);

    // Not yet due, so it cannot be claimed.
    expect((await queue.claimNext(type)).kind).toBe("empty");

    // Once due (bounded polling), it becomes claimable again.
    await waitFor(async () => (await queue.claimNext(type)).kind === "claimed", {
      timeoutMs: 5_000,
      intervalMs: 50,
      description: "job backoff elapsing",
    });
  });

  it("a malformed payload is discarded and removed from the queue", async () => {
    const type = JOB_TYPES.GROUP_SUMMARY_RECOMPUTE;
    const queue = new JobQueue(getRedis(), {
      maxAttempts: 5,
      baseBackoffMs: 500,
      maxBackoffMs: 2_000,
      leaseMs: 30_000,
      payloadTtlMs: 60_000,
    });

    const envelope = await queue.enqueue(type, { groupId: "corrupt" });
    await testRedisClient().set(`job:data:${envelope.jobId}`, "not-json-at-all");

    const result = await queue.claimNext(type);
    expect(result.kind).toBe("malformed");
    expect((await testRedisClient().get(`job:data:${envelope.jobId}`))).toBeNull();
    expect((await queue.claimNext(type)).kind).toBe("empty");
  });

  it("claims process the earliest-due job first", async () => {
    const type = JOB_TYPES.GROUP_SUMMARY_RECOMPUTE;
    const queue = new JobQueue(getRedis(), {
      maxAttempts: 5,
      baseBackoffMs: 500,
      maxBackoffMs: 2_000,
      leaseMs: 30_000,
      payloadTtlMs: 60_000,
    });

    const late = await queue.enqueue(type, { groupId: "late" }, {
      scheduledFor: Date.now() + 5_000,
    });
    const early = await queue.enqueue(type, { groupId: "early" }, {
      scheduledFor: Date.now() - 1_000,
    });

    const firstClaim = await queue.claimNext(type);
    expect(firstClaim.kind).toBe("claimed");
    if (firstClaim.kind === "claimed") {
      expect(firstClaim.envelope.jobId).toBe(early.jobId);
      await queue.complete(type, early.jobId);
    }

    // The late job is still not due.
    expect((await queue.claimNext(type)).kind).toBe("empty");
    await queue.discard(type, late.jobId);
  });
});