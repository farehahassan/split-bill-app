import { getRedisClient } from "../../../src/redis/redisClient.js";

/**
 * Flushes the entire logical Redis database the integration suite runs against
 * (the isolated db index from INTEGRATION_REDIS_URL). Because the suite has
 * its own Redis instance/database, this can never touch dev or prod data.
 */
export async function clearTestRedis(): Promise<void> {
  const redis = getRedisClient();
  if (redis.status !== "ready") {
    await redis.connect();
  }
  await redis.flushdb();
}

/** Returns the shared ioredis client for direct (non-RedisLike) assertions. */
export function testRedisClient() {
  return getRedisClient();
}