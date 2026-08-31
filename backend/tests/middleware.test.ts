import { describe, it, expect } from "vitest";
import { z } from "zod";
import { validate } from "../src/middleware/validate.js";
import type { Request, Response } from "express";

function createMockReq(
  overrides: Partial<{ body: unknown; query: unknown; params: unknown }> = {},
): Request {
  return {
    body: overrides.body ?? {},
    query: (overrides.query ?? {}) as Request["query"],
    params: (overrides.params ?? {}) as Request["params"],
  } as Request;
}

function createMockRes(): Response {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("Validation middleware", () => {
  it("should pass valid body through", () => {
    const schema = z.object({ name: z.string() });
    const middleware = validate({ body: schema });

    const req = createMockReq({ body: { name: "test" } });
    const res = createMockRes();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.body).toEqual({ name: "test" });
  });

  it("should forward invalid body as ZodError to next", () => {
    const schema = z.object({ name: z.string() });
    const middleware = validate({ body: schema });

    const req = createMockReq({ body: { name: 123 } });
    const res = createMockRes();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(next.mock.calls[0]?.[0]).toBeInstanceOf(z.ZodError);
  });

  it("should validate query parameters", () => {
    const schema = z.object({ page: z.coerce.number() });
    const middleware = validate({ query: schema });

    const req = createMockReq({ query: { page: "1" } });
    const res = createMockRes();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });

  it("should validate params", () => {
    const schema = z.object({ id: z.string().uuid() });
    const middleware = validate({ params: schema });

    const req = createMockReq({
      params: { id: "550e8400-e29b-41d4-a716-446655440000" },
    });
    const res = createMockRes();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });

  it("should forward invalid params as ZodError to next", () => {
    const schema = z.object({ id: z.string().uuid() });
    const middleware = validate({ params: schema });

    const req = createMockReq({ params: { id: "not-a-uuid" } });
    const res = createMockRes();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(next.mock.calls[0]?.[0]).toBeInstanceOf(z.ZodError);
  });
});
