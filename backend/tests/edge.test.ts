import { describe, it, expect, afterEach, vi } from "vitest";
import request from "supertest";
import type { Request, Response } from "express";
import { createApp } from "../src/app.js";
import { HTTP_STATUSES } from "../src/constants/http-statuses.js";
import { parseTrustProxyRaw } from "../src/edge/trustProxy.js";
import { EDGE_MAX_BODY_BYTES, edgeRequestGuard } from "../src/edge/requestGuard.js";
import { errorHandler } from "../src/middleware/errorHandler.js";
import { FakeRedis } from "./helpers/fakeRedis.js";

function makeGuardReq(originalUrl: string, headers: Record<string, string> = {}): Request {
  return { method: "GET", url: originalUrl, originalUrl, headers } as unknown as Request;
}

function makeResLike(): Response & { statusCode: number; body: unknown } {
  const state = { statusCode: 200, body: undefined as unknown };
  const res = {
    status: (code: number) => {
      state.statusCode = code;
      return res;
    },
    json: (body: unknown) => {
      state.body = body;
      return res;
    },
  };
  return Object.defineProperties(res, {
    statusCode: { get: () => state.statusCode, configurable: true },
    body: { get: () => state.body, configurable: true },
  }) as unknown as Response & { statusCode: number; body: unknown };
}

describe("Trust proxy configuration", () => {
  afterEach(() => {
    delete process.env.TRUST_PROXY;
  });

  it("parses the TRUST_PROXY env var into Express-safe values", () => {
    expect(parseTrustProxyRaw("")).toBe(false);
    expect(parseTrustProxyRaw("false")).toBe(false);
    expect(parseTrustProxyRaw("no")).toBe(false);
    expect(parseTrustProxyRaw("0")).toBe(false);
    expect(parseTrustProxyRaw("true")).toBe(1);
    expect(parseTrustProxyRaw("yes")).toBe(1);
    expect(parseTrustProxyRaw("1")).toBe(1);
    expect(parseTrustProxyRaw("3")).toBe(3);
    expect(parseTrustProxyRaw("loopback")).toBe("loopback");
    expect(parseTrustProxyRaw("10.0.0.0/8")).toBe("10.0.0.0/8");
  });

  it("resolves clients through X-Forwarded-For when TRUST_PROXY is set", async () => {
    process.env.TRUST_PROXY = "1";
    process.env.RATE_LIMIT_WINDOW_MS = "60000";
    process.env.RATE_LIMIT_MAX = "1";
    process.env.AUTH_RATE_LIMIT_MAX = "1";
    const redis = new FakeRedis();
    const app = createApp({ redis });

    // Same spoofed client twice → blocked on the second call.
    expect(
      (await request(app).get("/api/v1/groups").set("X-Forwarded-For", "203.0.113.7")).status,
    ).toBe(HTTP_STATUSES.UNAUTHORIZED);
    expect(
      (await request(app).get("/api/v1/groups").set("X-Forwarded-For", "203.0.113.7")).status,
    ).toBe(HTTP_STATUSES.TOO_MANY_REQUESTS);

    // A different forwarded client is unaffected.
    expect(
      (await request(app).get("/api/v1/groups").set("X-Forwarded-For", "198.51.100.9")).status,
    ).toBe(HTTP_STATUSES.UNAUTHORIZED);
  });
});

describe("Edge request guard", () => {
  it("rejects URLs containing control characters", () => {
    const res = makeResLike();
    edgeRequestGuard()(makeGuardReq("/health\u0000inject"), res, vi.fn() as never);

    expect(res.statusCode).toBe(HTTP_STATUSES.NOT_FOUND);
    expect(res.body).toEqual({ success: false, message: "Endpoint not found." });
  });

  it("rejects absurdly long URLs before routing handles them", () => {
    const res = makeResLike();
    const longUrl = `/${"a".repeat(2049)}`;
    edgeRequestGuard()(makeGuardReq(longUrl), res, vi.fn() as never);

    expect(res.statusCode).toBe(HTTP_STATUSES.NOT_FOUND);
  });

  it("rejects requests whose declared Content-Length exceeds the body limit", async () => {
    const app = createApp();
    const oversized = String(EDGE_MAX_BODY_BYTES + 1);

    const res = await request(app).get("/health").set("Content-Length", oversized);

    expect(res.status).toBe(HTTP_STATUSES.PAYLOAD_TOO_LARGE);
    expect(res.body).toEqual({ success: false, message: "Request body too large." });
  });

  it("removes poorly formed X-Request-Id headers so tracing stays safe", () => {
    const req = makeGuardReq("/health", { "x-request-id": "bad\u0000id" });
    const next = vi.fn();

    edgeRequestGuard()(req, makeResLike(), next as never);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.headers["x-request-id"]).toBeUndefined();
  });

  it("keeps well-formed X-Request-Id headers untouched", () => {
    const req = makeGuardReq("/health", { "x-request-id": "trace-123" });
    const next = vi.fn();

    edgeRequestGuard()(req, makeResLike(), next as never);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.headers["x-request-id"]).toBe("trace-123");
  });

  it("passes ordinary requests through to the pipeline", async () => {
    const app = createApp();
    const res = await request(app).get("/health");
    expect(res.status).toBe(HTTP_STATUSES.OK);
  });
});

describe("Oversized body handling", () => {
  it("returns a 413 envelope from the error handler as a backstop", () => {
    const json = vi.fn();
    const res = {
      statusCode: 200,
      status: vi.fn((code: number) => {
        res.statusCode = code;
        return res;
      }),
      json,
      setHeader: vi.fn(),
    } as unknown as Response;

    const bodyParserError = Object.assign(new Error("entity.too.large"), {
      type: "entity.too.large",
      status: 413,
    });

    errorHandler(bodyParserError, { requestId: "trace-1" } as Request, res, vi.fn() as never);

    expect(res.statusCode).toBe(HTTP_STATUSES.PAYLOAD_TOO_LARGE);
    expect(json).toHaveBeenCalledWith({
      success: false,
      message: "Request body too large.",
    });
  });
});
