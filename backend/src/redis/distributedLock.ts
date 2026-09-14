import { randomUUID } from "node:crypto";

import { logger } from "../utils/logger.js";
import type { RedisLike } from "./redisClient.js";

/**
 * Releases the key only when the caller's ownership token still matches. Using
 * a Lua script makes the check-and-delete atomic, which is what prevents one
 * process from releasing a lock that another process has since acquired (for
 * example after a TTL expiry).
 */
const RELEASE_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
else
  return 0
end
`;

/**
 * Thrown by {@link DistributedLock.withLock} when the lock is genuinely held by
 * another process (the lock exists in Redis and is not ours). The caller maps
 * this into a domain error (e.g. HTTP 409). It is never thrown when Redis is
 * simply unavailable — that path degrades to running without coordination.
 */
export class DistributedLockConflictError extends Error {
  readonly lockKey: string;

  constructor(lockKey: string) {
    super(`The distributed lock "${lockKey}" is already held by another process.`);
    this.name = "DistributedLockConflictError";
    this.lockKey = lockKey;
  }
}

/**
 * A single-instance, TTL-backed distributed lock. Acquisition uses the atomic
 * `SET key token NX PX ttl` primitive: exactly one process out of any number of
 * concurrent contenders receives the lock, and every held lock carries a TTL so
 * a crashed holder can never deadlock the resource.
 *
 * Failure policy (documented in the README):
 * - Redis error while acquiring → the operation runs WITHOUT coordination while
 *   a warning is logged. The lock never claims to be held when it is not, and
 *   the database + idempotency layer remain the source of truth.
 * - Lock held by another process → {@link DistributedLockConflictError}.
 * - Release errors are logged; the TTL is the backstop.
 *
 * The lock is a coordination hint, not a correctness barrier: it serializes
 * concurrent writes to make them deterministic. If the TTL is too short the two
 * holders can temporarily overlap, so the TTL must comfortably exceed the
 * longest protected operation.
 */
export class DistributedLock {
  constructor(
    private readonly redis: RedisLike,
    private readonly ttlMs: number,
  ) {}

  /**
   * Attempts to acquire the lock, returning a unique ownership token on success
   * or `null` when the lock is held by another process. Redis errors propagate
   * to the caller.
   */
  async acquire(key: string): Promise<string | null> {
    const token = randomUUID();
    const result = await this.redis.set(key, token, "PX", this.ttlMs, "NX");
    return result === "OK" ? token : null;
  }

  /**
   * Releases the lock only when `token` is still the lock's owner. Returns
   * `true` when the lock was released by this call. Redis errors propagate.
   */
  async release(key: string, token: string): Promise<boolean> {
    const released = await this.redis.eval(RELEASE_SCRIPT, 1, key, token);
    return released === 1;
  }

  /**
   * Runs `operation` while holding the lock on `key`, releasing it afterwards
   * even when the operation fails. See the class doc for the failure policy.
   */
  async withLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
    let token: string | null = null;

    try {
      try {
        token = await this.acquire(key);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn("Distributed lock is unavailable; running the operation without coordination", {
          lockKey: key,
          error: message,
        });
        return operation();
      }

      if (token === null) {
        throw new DistributedLockConflictError(key);
      }

      return await operation();
    } finally {
      if (token !== null) {
        try {
          await this.release(key, token);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          logger.warn("Failed to release distributed lock; it will expire via its TTL", {
            lockKey: key,
            error: message,
          });
        }
      }
    }
  }
}
