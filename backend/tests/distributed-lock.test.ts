import { describe, it, expect, vi } from "vitest";
import { DistributedLock, DistributedLockConflictError } from "../src/redis/distributedLock.js";
import { FakeRedis, FailingRedis } from "./helpers/fakeRedis.js";

const LOCK_KEY = "lock:settlement:group:group-1";
const TTL_MS = 10_000;

class CountingFailRedis extends FailingRedis {
  evalCalls = 0;

  override eval(): Promise<unknown> {
    this.evalCalls += 1;
    return Promise.reject(new Error("Connection is closed."));
  }
}

class ReleaseFailRedis extends FakeRedis {
  failingRelease = false;

  override async eval(
    script: string,
    numKeys: number,
    ...args: (string | number)[]
  ): Promise<unknown> {
    if (this.failingRelease && script.includes("ARGV[1]") && script.includes("DEL")) {
      throw new Error("Connection is closed.");
    }
    return super.eval(script, numKeys, ...args);
  }
}

describe("DistributedLock", () => {
  it("acquires the lock, runs the operation, and releases it", async () => {
    const redis = new FakeRedis();
    const lock = new DistributedLock(redis, TTL_MS);

    const result = await lock.withLock(LOCK_KEY, async () => "done");

    expect(result).toBe("done");
    expect(redis.store.has(LOCK_KEY)).toBe(false);
  });

  it("passes a unique, TTL-bounded ownership token to Redis on acquisition", async () => {
    const redis = new FakeRedis();
    const lock = new DistributedLock(redis, TTL_MS);
    const before = Date.now();

    const tokenA = await lock.acquire(LOCK_KEY);
    const first = redis.store.get(LOCK_KEY);
    await lock.release(LOCK_KEY, tokenA as string);

    const tokenB = await lock.acquire(LOCK_KEY);
    const second = redis.store.get(LOCK_KEY);
    await lock.release(LOCK_KEY, tokenB as string);

    expect(tokenA).toBeDefined();
    expect(tokenB).toBeDefined();
    expect(tokenA).not.toBe(tokenB);
    expect(first?.value).toBe(tokenA);
    expect(second?.value).toBe(tokenB);
    expect(first?.expiresAt).not.toBeNull();
    expect((first?.expiresAt as number) - before).toBeGreaterThanOrEqual(TTL_MS);
  });

  it("throws when the lock is already held and skips the operation", async () => {
    const redis = new FakeRedis();
    await redis.set(LOCK_KEY, "someone-else", "PX", TTL_MS, "NX");
    const lock = new DistributedLock(redis, TTL_MS);
    const operation = vi.fn(async () => "SHOULD NOT RUN");

    await expect(lock.withLock(LOCK_KEY, operation)).rejects.toBeInstanceOf(
      DistributedLockConflictError,
    );
    expect(operation).not.toHaveBeenCalled();
    expect(redis.store.get(LOCK_KEY)?.value).toBe("someone-else");
  });

  it("releases only when the caller still owns the lock", async () => {
    const redis = new FakeRedis();
    const lock = new DistributedLock(redis, TTL_MS);

    const token = await lock.acquire(LOCK_KEY);
    // Another process reacquired the lock after a TTL expiry.
    await redis.del(LOCK_KEY);
    await redis.set(LOCK_KEY, "new-owner", "PX", TTL_MS, "NX");

    const released = await lock.release(LOCK_KEY, token as string);

    expect(released).toBe(false);
    expect(redis.store.get(LOCK_KEY)?.value).toBe("new-owner");
  });

  it("releases the lock even when the operation fails", async () => {
    const redis = new FakeRedis();
    const lock = new DistributedLock(redis, TTL_MS);

    await expect(
      lock.withLock(LOCK_KEY, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(redis.store.has(LOCK_KEY)).toBe(false);
  });

  it("runs the operation without coordination when Redis is unavailable", async () => {
    const redis = new FailingRedis();
    const lock = new DistributedLock(redis, TTL_MS);

    const result = await lock.withLock(LOCK_KEY, async () => 42);

    expect(result).toBe(42);
  });

  it("does not attempt to release when the lock was never acquired", async () => {
    const redis = new CountingFailRedis();
    const lock = new DistributedLock(redis, TTL_MS);

    const result = await lock.withLock(LOCK_KEY, async () => "value");

    expect(result).toBe("value");
    expect(redis.evalCalls).toBe(0);
  });

  it("lets the TTL clean up when releasing fails, keeping the operation result", async () => {
    const redis = new ReleaseFailRedis();
    redis.failingRelease = true;
    const lock = new DistributedLock(redis, 50);

    const result = await lock.withLock(LOCK_KEY, async () => "completed");

    expect(result).toBe("completed");
    // The key is still present (release failed) but is TTL-bounded.
    expect(redis.store.has(LOCK_KEY)).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(await redis.get(LOCK_KEY)).toBeNull();
  });

  it("exposes acquire() and release() as primitives returning the token", async () => {
    const redis = new FakeRedis();
    const lock = new DistributedLock(redis, TTL_MS);

    const token = await lock.acquire(LOCK_KEY);
    expect(token).toBeTypeOf("string");

    const held = await lock.acquire(LOCK_KEY);
    expect(held).toBeNull();

    expect(await lock.release(LOCK_KEY, token as string)).toBe(true);
    expect(redis.store.has(LOCK_KEY)).toBe(false);
  });
});
