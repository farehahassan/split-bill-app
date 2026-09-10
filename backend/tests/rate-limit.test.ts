import { describe, it, expect, afterEach, vi } from "vitest";
import request from "supertest";
import type { Request, Response } from "express";
import { createApp } from "../src/app.js";
import { HTTP_STATUSES } from "../src/constants/http-statuses.js";
import { apiLimiter } from "../src/middleware/rateLimiter.js";

function setRateLimitEnv(overrides: Record<string, string>): void {
  process.env.RATE_LIMIT_WINDOW_MS = overrides.RATE_LIMIT_WINDOW_MS ?? "60000";
  process.env.RATE_LIMIT_MAX = overrides.RATE_LIMIT_MAX ?? "100";
  process.env.AUTH_RATE_LIMIT_MAX = overrides.AUTH_RATE_LIMIT_MAX ?? "20";
}

function clearRateLimitEnv(): void {
  delete process.env.RATE_LIMIT_WINDOW_MS;
  delete process.env.RATE_LIMIT_MAX;
  delete process.env.AUTH_RATE_LIMIT_MAX;
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

describe("Rate limiting", () => {
  afterEach(() => {
    clearRateLimitEnv();
  });

  it("allows requests up to the configured limit", async () => {
    setRateLimitEnv({ RATE_LIMIT_MAX: "3" });
    const app = createApp();

    for (let i = 0; i < 3; i++) {
      const res = await request(app).get("/api/v1/groups");
      expect(res.status).toBe(HTTP_STATUSES.UNAUTHORIZED);
    }
  });

  it("returns 429 with the API envelope once the limit is exceeded", async () => {
    setRateLimitEnv({ RATE_LIMIT_MAX: "3" });
    const app = createApp();

    for (let i = 0; i < 3; i++) {
      await request(app).get("/api/v1/groups");
    }

    const blocked = await request(app).get("/api/v1/groups");

    expect(blocked.status).toBe(HTTP_STATUSES.TOO_MANY_REQUESTS);
    expect(blocked.body).toEqual({ success: false, message: "Too many requests" });
  });

  it("emits rate-limit headers and Retry-After on blocked requests", async () => {
    setRateLimitEnv({ RATE_LIMIT_MAX: "1" });
    const app = createApp();

    await request(app).get("/api/v1/groups");
    const blocked = await request(app).get("/api/v1/groups");

    expect(blocked.status).toBe(HTTP_STATUSES.TOO_MANY_REQUESTS);
    expect(Number(blocked.headers["ratelimit-limit"])).toBe(1);
    expect(Number(blocked.headers["ratelimit-remaining"])).toBe(0);
    expect(blocked.headers["retry-after"]).toBeDefined();
  });

  it("resets the counter after the configured window elapses", async () => {
    setRateLimitEnv({ RATE_LIMIT_MAX: "1", RATE_LIMIT_WINDOW_MS: "150" });
    const app = createApp();

    expect((await request(app).get("/api/v1/groups")).status).toBe(HTTP_STATUSES.UNAUTHORIZED);
    expect((await request(app).get("/api/v1/groups")).status).toBe(HTTP_STATUSES.TOO_MANY_REQUESTS);

    await new Promise((resolve) => setTimeout(resolve, 250));

    expect((await request(app).get("/api/v1/groups")).status).toBe(HTTP_STATUSES.UNAUTHORIZED);
  });

  it("applies a stricter limit to authentication routes", async () => {
    setRateLimitEnv({ AUTH_RATE_LIMIT_MAX: "2", RATE_LIMIT_MAX: "100" });
    const app = createApp();

    // Two unauthenticated requests hit the auth limiter but stay under its cap.
    expect((await request(app).get("/api/v1/auth/me")).status).toBe(HTTP_STATUSES.UNAUTHORIZED);
    expect((await request(app).get("/api/v1/auth/me")).status).toBe(HTTP_STATUSES.UNAUTHORIZED);

    // The third request exceeds the auth limit → 429 instead of 401.
    const blocked = await request(app).get("/api/v1/auth/me");
    expect(blocked.status).toBe(HTTP_STATUSES.TOO_MANY_REQUESTS);
    expect(blocked.body).toEqual({ success: false, message: "Too many requests" });
  });

  it("keeps guard endpoints reachable even after the limiter is exhausted", async () => {
    setRateLimitEnv({ RATE_LIMIT_MAX: "2" });
    const app = createApp();

    await request(app).get("/api/v1/groups");
    await request(app).get("/api/v1/groups");
    expect((await request(app).get("/api/v1/groups")).status).toBe(HTTP_STATUSES.TOO_MANY_REQUESTS);

    expect((await request(app).get("/health")).status).toBe(HTTP_STATUSES.OK);
    expect((await request(app).get("/metrics")).status).toBe(HTTP_STATUSES.OK);
  });

  it("keeps a non-auth endpoint unaffected by auth-route traffic", async () => {
    setRateLimitEnv({ AUTH_RATE_LIMIT_MAX: "1", RATE_LIMIT_MAX: "100" });
    const app = createApp();

    await request(app).get("/api/v1/auth/me");

    // Non-auth routes are on the general limiter, not the auth limiter.
    const res = await request(app).get("/api/v1/groups");
    expect(res.status).toBe(HTTP_STATUSES.UNAUTHORIZED);
  });

  it("does not break existing error handling while under the limit", async () => {
    setRateLimitEnv({ RATE_LIMIT_MAX: "10" });
    const app = createApp();

    const res = await request(app)
      .post("/api/v1/auth/login")
      .set("Content-Type", "application/json")
      .send({});

    expect(res.status).toBe(HTTP_STATUSES.BAD_REQUEST);
    expect(res.body.success).toBe(false);
  });

  it("keeps rate-limit state independent per client IP", async () => {
    setRateLimitEnv({ RATE_LIMIT_MAX: "2" });
    const limiter = apiLimiter();

    const resA1 = makeMockRes();
    const nextA1 = vi.fn();
    await limiter(makeMockReq("127.0.0.1"), resA1, nextA1 as never);
    expect(nextA1).toHaveBeenCalledTimes(1);

    const resA2 = makeMockRes();
    const nextA2 = vi.fn();
    await limiter(makeMockReq("127.0.0.1"), resA2, nextA2 as never);
    expect(nextA2).toHaveBeenCalledTimes(1);

    // A different client is not affected by client A's usage.
    const resB = makeMockRes();
    const nextB = vi.fn();
    await limiter(makeMockReq("127.0.0.2"), resB, nextB as never);
    expect(nextB).toHaveBeenCalledTimes(1);

    // Client A is now over its own limit.
    const resA3 = makeMockRes();
    const nextA3 = vi.fn();
    await limiter(makeMockReq("127.0.0.1"), resA3, nextA3 as never);
    expect(nextA3).not.toHaveBeenCalled();
    expect(resA3.statusCode).toBe(HTTP_STATUSES.TOO_MANY_REQUESTS);
  });
});
