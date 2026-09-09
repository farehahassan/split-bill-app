import request from "supertest";

import { createApp } from "../../../src/app.js";
import { isRedisAvailable } from "../../../src/redis/redisClient.js";

/**
 * Builds the real Express application wired to the real PostgreSQL + Redis
 * singletons. Because the setup file connected Redis, `isRedisAvailable()` is
 * true and the app uses Redis-backed (cross-instance) rate limiting, the
 * distributed lock, and the shared job queue — exactly like production.
 */
export function buildTestApp(): ReturnType<typeof createApp> {
  if (!isRedisAvailable()) {
    throw new Error(
      "Cannot build the test app: Redis is not connected. " +
        "Run `docker compose -f docker-compose.yml up -d --wait` and re-run the integration suite.",
    );
  }
  return createApp();
}

/** A supertest agent with `Accept: application/json` for easy JSON APIs. */
export function testAgent(app: ReturnType<typeof createApp>) {
  return request.agent(app);
}

/** Builds the `Authorization: Bearer <token>` header value. */
export function bearer(token: string): string {
  return `Bearer ${token}`;
}