import { describe, it, expect, vi } from "vitest";
import type { Request, Response } from "express";
import { asyncHandler } from "../src/utils/asyncHandler.js";

function createMockReq(): Request {
  return {} as Request;
}

function createMockRes(): Response {
  const res = {} as Response;
  return res;
}

describe("asyncHandler", () => {
  it("should call the wrapped handler with req, res and next", async () => {
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();
    const handler = vi.fn().mockResolvedValue(undefined);

    const wrapped = asyncHandler(handler);
    wrapped(req, res, next);

    await vi.waitFor(() => expect(handler).toHaveBeenCalledWith(req, res, next));
  });

  it("should forward a rejected promise to the next error handler without crashing", async () => {
    const req = createMockReq();
    const res = createMockRes();
    const error = new Error("boom");
    const next = vi.fn();
    const handler = vi.fn().mockRejectedValue(error);

    const wrapped = asyncHandler(handler);
    wrapped(req, res, next);

    await vi.waitFor(() => expect(next).toHaveBeenCalledWith(error));
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("should forward a synchronous throw to the next error handler", async () => {
    const req = createMockReq();
    const res = createMockRes();
    const error = new Error("sync boom");
    const next = vi.fn();
    const handler = vi.fn().mockImplementation(() => {
      throw error;
    });

    const wrapped = asyncHandler(handler as never);
    wrapped(req, res, next);

    await vi.waitFor(() => expect(next).toHaveBeenCalledWith(error));
  });
});
