import { describe, it, expect, afterEach, vi } from "vitest";
import request from "supertest";
import type { Request, Response } from "express";
import { createApp } from "../src/app.js";
import { HTTP_STATUSES } from "../src/constants/http-statuses.js";
import { apiLimiter } from "../src/middleware/rateLimiter.js";
import { FakeRedis, FailingRedis } from "./helpers/fakeRedis.js";

function setRateLimitEnv(overrides: Record<string, string>): void {
  process.env.RATE_LIMIT_WINDOW_MS = overrides.RATE_LIMIT_WINDOW_MS ?? "60000";
  process.env.RATE_LIMIT_MAX = overrides.RATE_LIMIT_MAX ?? "100";
  process.env.AUTH_RATE_LIMIT_MAX = overrides.AUTH_RATE_LIMIT_MAX ?? "20";
}

function clearRateLimitEnv(): void {
  delete process.env.RATE_LIMIT_WINDOW_MS;
  delete process.env.RATE_LIMIT_MAX;
  delete process.env.AUTH_RATE_LIMIT_MAX;
  delete process.env.TRUST_PROXY;
}

function makeMockReq(ip: string): Request {
  return {
    ip,
    headers: {},
    app: { get: () => false },
  } as unknown as Request;
}

function makeMockRes(): Response {
  const headers: Record<string, string> = {};
  const res = {
    writableEnded: false,
    statusCode: 200,
    setHeader: (name: string, value: string) => {
      headers[name] = value;
    },
    status: (code: number) => {
      res.statusCode = code;
      return res;
    },
    send: () => {
      res.writableEnded = true;
      return res;
    },
  };
  return res as unknown as Response;
}

describe("Redis-backed rate limiting", () => {
  afterEach(() => {
    clearRateLimitEnv();
  });

  it("limits requests through the Redis store when Redis is available", async () => {
    setRateLimitEnv({ RATE_LIMIT_MAX: "3" });
    const redis = new FakeRedis();
    const app = createApp({ redis });

    for (let i = 0; i < 3; i++) {
      expect((await request(app).get("/health")).status).toBe(HTTP_STATUSES.OK);
    }

    const blocked = await request(app).get("/health");
    expect(blocked.status).toBe(HTTP_STATUSES.TOO_MANY_REQUESTS);
    expect(blocked.body).toEqual({ success: false, message: "Too many requests" });
  });

  it("writes prefixed counters to Redis", async () => {
    setRateLimitEnv({ RATE_LIMIT_MAX: "10" });
    const redis = new FakeRedis();
    const app = createApp({ redis });

    await request(app).get("/health");

    const keys = [...redis.store.keys()];
    expect(keys.some((key) => key.startsWith("rl:api:"))).toBe(true);
    expect(keys.every((key) => key.startsWith("rl:api:"))).toBe(true);
  });

  it("keeps the auth limiter counters separate from the API limiter", async () => {
    setRateLimitEnv({ AUTH_RATE_LIMIT_MAX: "1", RATE_LIMIT_MAX: "100" });
    const redis = new FakeRedis();
    const app = createApp({ redis });

    await request(app).get("/health");
    const afterHealth = [...redis.store.keys()];
    expect(afterHealth.some((key) => key.startsWith("rl:api:"))).toBe(true);
    expect(afterHealth.some((key) => key.startsWith("rl:auth:"))).toBe(false);

    await request(app).get("/api/v1/auth/me");
    const afterAuth = [...redis.store.keys()];
    expect(afterAuth.some((key) => key.startsWith("rl:auth:"))).toBe(true);
  });

  it("shares rate-limit state across app instances (distributed protection)", async () => {
    setRateLimitEnv({ RATE_LIMIT_MAX: "3" });
    const redis = new FakeRedis();
    const appA = createApp({ redis });
    const appB = createApp({ redis });

    for (let i = 0; i < 3; i++) {
      expect((await request(appA).get("/health")).status).toBe(HTTP_STATUSES.OK);
    }

    const blockedOnAppB = await request(appB).get("/health");
    expect(blockedOnAppB.status).toBe(HTTP_STATUSES.TOO_MANY_REQUESTS);
  });

  it("emits rate-limit headers and Retry-After on blocked requests", async () => {
    setRateLimitEnv({ RATE_LIMIT_MAX: "1" });
    const app = createApp({ redis: new FakeRedis() });

    await request(app).get("/health");
    const blocked = await request(app).get("/health");

    expect(blocked.status).toBe(HTTP_STATUSES.TOO_MANY_REQUESTS);
    expect(Number(blocked.headers["ratelimit-limit"])).toBe(1);
    expect(Number(blocked.headers["ratelimit-remaining"])).toBe(0);
    expect(Number(blocked.headers["ratelimit-reset"])).toBeGreaterThan(0);
    expect(blocked.headers["retry-after"]).toBeDefined();
  });

  it("resets the counter after the window elapses via the Redis TTL", async () => {
    setRateLimitEnv({ RATE_LIMIT_MAX: "1", RATE_LIMIT_WINDOW_MS: "150" });
    const app = createApp({ redis: new FakeRedis() });

    expect((await request(app).get("/health")).status).toBe(HTTP_STATUSES.OK);
    expect((await request(app).get("/health")).status).toBe(HTTP_STATUSES.TOO_MANY_REQUESTS);

    await new Promise((resolve) => setTimeout(resolve, 250));

    expect((await request(app).get("/health")).status).toBe(HTTP_STATUSES.OK);
  });

  it("keeps rate-limit state independent per client IP in Redis", async () => {
    setRateLimitEnv({ RATE_LIMIT_MAX: "2" });
    const limiter = apiLimiter(new FakeRedis());

    await limiter(makeMockReq("127.0.0.1"), makeMockRes(), vi.fn() as never);
    await limiter(makeMockReq("127.0.0.1"), makeMockRes(), vi.fn() as never);

    const resB = makeMockRes();
    const nextB = vi.fn();
    await limiter(makeMockReq("127.0.0.2"), resB, nextB as never);
    expect(nextB).toHaveBeenCalledTimes(1);

    const resA3 = makeMockRes();
    const nextA3 = vi.fn();
    await limiter(makeMockReq("127.0.0.1"), resA3, nextA3 as never);
    expect(nextA3).not.toHaveBeenCalled();
    expect(resA3.statusCode).toBe(HTTP_STATUSES.TOO_MANY_REQUESTS);
  });

  it("fails open when Redis is unavailable mid-request", async () => {
    setRateLimitEnv({ RATE_LIMIT_MAX: "1" });
    const app = createApp({ redis: new FailingRedis() });

    for (let i = 0; i < 5; i++) {
      expect((await request(app).get("/health")).status).toBe(HTTP_STATUSES.OK);
    }
  });
});
