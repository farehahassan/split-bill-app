import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import type { Request, Response } from "express";
import { createApp } from "../src/app.js";
import { HTTP_STATUSES } from "../src/constants/http-statuses.js";
import { requestId } from "../src/middleware/requestId.js";

function makeMockReq(headers: Record<string, string | undefined> = {}): Request {
  return { headers } as Request;
}

function makeMockRes(): Response {
  const res = { setHeader: vi.fn(), headers: {} as Record<string, string> } as unknown as Response;
  res.setHeader = vi.fn((name: string, value: string) => {
    (res.headers as unknown as Record<string, string>)[name] = value;
    return res;
  }) as never;
  return res;
}

describe("Request ID middleware", () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    app = createApp();
  });

  it("response includes X-Request-Id header", async () => {
    const res = await request(app).get("/health");

    expect(res.status).toBe(HTTP_STATUSES.OK);
    expect(res.headers["x-request-id"]).toBeDefined();
  });

  it("generates a UUID v4 request ID when none is provided", async () => {
    const res = await request(app).get("/health");

    const id = res.headers["x-request-id"] as string;
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("returns distinct request IDs for separate requests", async () => {
    const first = await request(app).get("/health");
    const second = await request(app).get("/health");

    expect(first.headers["x-request-id"]).not.toBe(second.headers["x-request-id"]);
  });

  it("honors a safe client-provided X-Request-Id", async () => {
    const res = await request(app).get("/health").set("X-Request-Id", "trace-123");

    expect(res.headers["x-request-id"]).toBe("trace-123");
  });

  it("falls back to a generated ID for an oversized header", async () => {
    const res = await request(app).get("/health").set("X-Request-Id", "a".repeat(200));

    const id = res.headers["x-request-id"] as string;
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("falls back to a generated ID for an empty header", async () => {
    const res = await request(app).get("/health").set("X-Request-Id", "");

    const id = res.headers["x-request-id"] as string;
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("includes X-Request-Id on 404 error responses", async () => {
    const res = await request(app).get("/unknown-route");

    expect(res.status).toBe(HTTP_STATUSES.NOT_FOUND);
    expect(res.headers["x-request-id"]).toBeDefined();
    expect(res.body.success).toBe(false);
  });

  it("includes X-Request-Id on unauthenticated API error responses", async () => {
    const res = await request(app).get("/api/v1/auth/me");

    expect(res.status).toBe(HTTP_STATUSES.UNAUTHORIZED);
    expect(res.headers["x-request-id"]).toBeDefined();
    expect(res.body.success).toBe(false);
  });
});

describe("requestId middleware unit", () => {
  it("accepts a safe client-provided ID and sets it on the response", () => {
    const req = makeMockReq({ "x-request-id": "client-trace-1" });
    const res = makeMockRes();
    const next = vi.fn();

    requestId(req, res, next as never);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.requestId).toBe("client-trace-1");
    expect(res.setHeader).toHaveBeenCalledWith("X-Request-Id", "client-trace-1");
  });

  it("generates a UUID for a client-provided unsafe ID", () => {
    const req = makeMockReq({ "x-request-id": "bad\u0000id" });
    const res = makeMockRes();
    const next = vi.fn();

    requestId(req, res, next as never);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("generates a UUID when no header is present", () => {
    const req = makeMockReq();
    const res = makeMockRes();
    const next = vi.fn();

    requestId(req, res, next as never);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});

describe("Request completion logging", () => {
  it("logs request completion with the requestId and no credentials", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { setSilent } = await import("../src/utils/logger.js");
    setSilent(false);

    try {
      const app = createApp();
      const res = await request(app).get("/health");

      const logs = consoleSpy.mock.calls.map((call) => String(call[0]));
      const completionLog = logs.find((line) => line.includes("request completed"));

      const id = res.headers["x-request-id"] as string;
      expect(id).toBeDefined();
      expect(completionLog).toBeDefined();
      expect(completionLog).toContain(id);
      expect(completionLog).toContain(`"method":"GET"`);
      expect(completionLog).toContain(`"/health"`);
      expect(completionLog).toContain(`"statusCode":200`);
      expect(completionLog).not.toContain("authorization");
      expect(completionLog).not.toContain("password");
      expect(completionLog).not.toContain("token");
      expect(completionLog).not.toContain("cookie");
    } finally {
      setSilent(true);
      consoleSpy.mockRestore();
    }
  });
});
