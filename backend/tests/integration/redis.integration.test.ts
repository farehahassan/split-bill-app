import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { RedisCacheStore } from "../../src/redis/cacheStore.js";
import { DistributedLock } from "../../src/redis/distributedLock.js";
import { RedisRateLimitStore } from "../../src/redis/rateLimitStore.js";
import { createRedisAdapter, type RedisLike } from "../../src/redis/redisClient.js";
import { canRunIntegrationTests, openTestRedis } from "./helpers.js";

describe.skipIf(!canRunIntegrationTests)("Redis integration tests", () => {
  let client: ReturnType<typeof openTestRedis>;
  let redis: RedisLike;

  beforeAll(async () => {
    client = openTestRedis();
    await client.connect();
    redis = createRedisAdapter(client);
  });

  beforeEach(async () => {
    await client.flushdb();
  });

  afterAll(async () => {
    await client.quit();
  });

  it("connects and answers PING", async () => {
    await expect(redis.ping()).resolves.toBe("PONG");
    expect(redis.status).toBe("ready");
  });

  it("supports the raw set/get/del primitives of the RedisLike contract", async () => {
    await redis.set("itest:value", "hello", "PX", 60_000);
    await expect(redis.get("itest:value")).resolves.toBe("hello");
    await expect(redis.del("itest:value")).resolves.toBe(1);
    await expect(redis.get("itest:value")).resolves.toBe(null);
  });

  it("honours the set-if-absent (NX) guard", async () => {
    expect(await redis.set("itest:nx", "first", "PX", 60_000, "NX")).toBe("OK");
    expect(await redis.set("itest:nx", "second", "PX", 60_000, "NX")).toBe(null);
    await expect(redis.get("itest:nx")).resolves.toBe("first");
  });

  it("RedisCacheStore persists values and removes them on delete", async () => {
    const store = new RedisCacheStore(redis);

    await store.set("itest:cache:key", "cached", 60);
    await expect(store.get("itest:cache:key")).resolves.toBe("cached");

    await store.delete("itest:cache:key");
    await expect(store.get("itest:cache:key")).resolves.toBe(null);
  });

  it("RedisCacheStore expires keys after their TTL elapses", async () => {
    const store = new RedisCacheStore(redis);

    await store.set("itest:cache:ttl", "gone-soon", 1);
    await new Promise((resolve) => setTimeout(resolve, 1_300));
    await expect(store.get("itest:cache:ttl")).resolves.toBe(null);
  });

  it("DistributedLock hands the lock to exactly one contender", async () => {
    const lock = new DistributedLock(redis, 10_000);

    const token = await lock.acquire("itest:lock:key");
    expect(token).toBeTruthy();
    await expect(lock.acquire("itest:lock:key")).resolves.toBeNull();
  });

  it("DistributedLock only releases its own owner token", async () => {
    const lock = new DistributedLock(redis, 10_000);

    const token = (await lock.acquire("itest:lock:key"))!;
    expect(await lock.release("itest:lock:key", "wrong-token")).toBe(false);
    await expect(redis.get("itest:lock:key")).resolves.toBe(token);

    expect(await lock.release("itest:lock:key", token)).toBe(true);
    await expect(lock.acquire("itest:lock:key")).resolves.toBeTruthy();
  });

  it("frees an expired lock so a later contender can acquire it", async () => {
    const shortLived = new DistributedLock(redis, 400);
    const token = (await shortLived.acquire("itest:lock:expiry"))!;
    expect(token).toBeTruthy();

    await new Promise((resolve) => setTimeout(resolve, 800));

    const renewed = new DistributedLock(redis, 10_000);
    await expect(renewed.acquire("itest:lock:expiry")).resolves.toBeTruthy();
  });

  it("RedisRateLimitStore counts hits atomically and resets the window", async () => {
    const storeA = new RedisRateLimitStore({ redis, prefix: "itest:rl:", windowMs: 60_000 });
    const storeB = new RedisRateLimitStore({ redis, prefix: "itest:rl:", windowMs: 60_000 });

    const first = await storeA.increment("shared");
    expect(first.totalHits).toBe(1);
    expect(first.resetTime).toBeInstanceOf(Date);

    const second = await storeB.increment("shared");
    expect(second.totalHits).toBe(2);

    await storeA.resetKey("shared");
    expect((await storeB.increment("shared")).totalHits).toBe(1);
  });
});
