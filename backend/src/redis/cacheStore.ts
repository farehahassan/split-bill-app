import type { RedisLike } from "./redisClient.js";

/**
 * Deliberately generic, string-only cache primitive shared by the domain cache
 * adapters. It has no business logic and no failure policy: commands fail fast,
 * exactly like the rest of the {@link RedisLike} contract. The caller decides
 * how a Redis outage is absorbed (the domain cache adapters turn read and write
 * failures into a logged, safe degradation back to PostgreSQL).
 *
 * TTLs are expressed in whole seconds and translated to Redis milliseconds
 * here, so domain code never deals with "PX" units or magic numbers.
 */
export interface CacheStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
}

/**
 * {@link CacheStore} backed by the shared Redis client. Commands propagate
 * errors to the caller; see the class doc for the contract.
 */
export class RedisCacheStore implements CacheStore {
  constructor(private readonly redis: RedisLike) {}

  get(key: string): Promise<string | null> {
    return this.redis.get(key);
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.redis.set(key, value, "PX", ttlSeconds * 1000);
  }

  async delete(key: string): Promise<void> {
    await this.redis.del(key);
  }
}
