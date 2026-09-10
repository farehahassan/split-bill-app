import { describe, it, expect, vi, afterEach } from "vitest";

import { RedisCacheStore } from "../src/redis/cacheStore.js";
import { FakeRedis, FailingRedis } from "./helpers/fakeRedis.js";

describe("RedisCacheStore", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("round-trips a value through the underlying Redis client", async () => {
    const redis = new FakeRedis();
    const store = new RedisCacheStore(redis);

    await store.set("cache:group:g1", "hello", 60);
    await expect(store.get("cache:group:g1")).resolves.toBe("hello");
  });

  it("returns null for a missing key", async () => {
    const store = new RedisCacheStore(new FakeRedis());

    await expect(store.get("cache:group:missing")).resolves.toBeNull();
  });

  it("stores the TTL in milliseconds on the Redis key", async () => {
    const redis = new FakeRedis();
    const store = new RedisCacheStore(redis);
    const start = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(start);

    await store.set("cache:group:g1", "v", 300);

    expect(redis.store.get("cache:group:g1")?.expiresAt).toBe(start + 300_000);
  });

  it("drops an expired key on read", async () => {
    const redis = new FakeRedis();
    const store = new RedisCacheStore(redis);

    vi.useFakeTimers();
    vi.setSystemTime(0);
    await store.set("cache:group:g1", "v", 1);

    vi.setSystemTime(2_000);
    await expect(store.get("cache:group:g1")).resolves.toBeNull();
  });

  it("deletes a key", async () => {
    const redis = new FakeRedis();
    const store = new RedisCacheStore(redis);

    await store.set("cache:group:g1", "v", 60);
    await store.delete("cache:group:g1");

    await expect(store.get("cache:group:g1")).resolves.toBeNull();
  });

  it("propagates Redis read failures to the caller (policy lives above)", async () => {
    const store = new RedisCacheStore(new FailingRedis());

    await expect(store.get("cache:group:g1")).rejects.toThrow("Connection is closed.");
  });

  it("propagates Redis write failures to the caller (policy lives above)", async () => {
    const store = new RedisCacheStore(new FailingRedis());

    await expect(store.set("cache:group:g1", "v", 60)).rejects.toThrow("Connection is closed.");
  });
});
