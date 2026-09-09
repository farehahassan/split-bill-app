import type { RequestHandler } from "express";
import { rateLimit, type RateLimitRequestHandler, type Store } from "express-rate-limit";

import { loadEnv } from "../config/env.js";
import { HTTP_STATUSES } from "../constants/http-statuses.js";
import { RedisRateLimitStore } from "../redis/rateLimitStore.js";
import type { RedisLike } from "../redis/redisClient.js";

const RATE_LIMIT_MESSAGE = { success: false, message: "Too many requests" } as const;

/**
 * Builds an `express-rate-limit` handler with the project's standard 429
 * response envelope.
 *
 * State lives in Redis (shared across instances) whenever a Redis client is
 * provided; otherwise it falls back to the library's process-local
 * `MemoryStore`, which must NOT be presented as distributed protection. If the
 * store raises an error mid-request, `passOnStoreError` lets the request
 * through (fail-open): API availability is preferred over enforcement, and the
 * outage is always logged by the store.
 *
 * Requests are attributed to the direct socket IP (`req.ip`). The app-level
 * `trust proxy` setting derives from the `TRUST_PROXY` env var, so
 * `X-Forwarded-For` is only trusted when a reverse proxy is actually in front
 * of the app. Rate limiting never queries the database and never uses request
 * IDs as client identity.
 */
function createLimiter(
  limit: number,
  windowMs: number,
  options: { store?: Store } = {},
): RateLimitRequestHandler {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    statusCode: HTTP_STATUSES.TOO_MANY_REQUESTS,
    message: RATE_LIMIT_MESSAGE,
    passOnStoreError: true,
    ...(options.store ? { store: options.store } : {}),
  });
}

/**
 * A fresh store per limiter keeps counters isolated (ERR_ERL_STORE_REUSE) and
 * the two limiters' keyspaces separate (`rl:api:` vs `rl:auth:`) — a single
 * authentication-heavy call must not exhaust the general API budget or vice
 * versa.
 */
function resolveStore(
  redis: RedisLike | undefined,
  prefix: string,
  windowMs: number,
): Store | undefined {
  return redis === undefined
    ? undefined
    : new RedisRateLimitStore({ redis, prefix, windowMs });
}

/**
 * General API limiter. Applied to every request at the app level.
 */
export function apiLimiter(redis?: RedisLike): RequestHandler {
  const env = loadEnv();
  const store = resolveStore(redis, "rl:api:", env.RATE_LIMIT_WINDOW_MS);
  return createLimiter(env.RATE_LIMIT_MAX, env.RATE_LIMIT_WINDOW_MS, { store });
}

/**
 * Authentication limiter. Applied to the `/api/v1/auth` router to cap
 * credential/refresh-token traffic (register, login, refresh, logout)
 * more tightly than general API traffic.
 */
export function authLimiter(redis?: RedisLike): RequestHandler {
  const env = loadEnv();
  const store = resolveStore(redis, "rl:auth:", env.RATE_LIMIT_WINDOW_MS);
  return createLimiter(env.AUTH_RATE_LIMIT_MAX, env.RATE_LIMIT_WINDOW_MS, { store });
}

/**
 * Sensitive auth limiter. Applied to the public verification / password-recovery
 * endpoints (verify-email, resend-verification, forgot-password, reset-password),
 * which accept unauthenticated email-or-token input and are therefore the
 * cheapest targets for enumeration or abuse. Their budget is far tighter than
 * the general auth limiter's.
 */
export function sensitiveEmailAuthLimiter(redis?: RedisLike): RequestHandler {
  const env = loadEnv();
  const store = resolveStore(redis, "rl:auth-email:", env.RATE_LIMIT_WINDOW_MS);
  return createLimiter(env.AUTH_EMAIL_RATE_LIMIT_MAX, env.RATE_LIMIT_WINDOW_MS, { store });
}
