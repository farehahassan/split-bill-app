import { describe, it, expect } from "vitest";
import type { Request } from "express";

import { resolveRouteTemplate, UNMATCHED_ROUTE } from "../src/metrics/route.js";

function makeReq(overrides: Partial<{ baseUrl: string; routePath: string }> = {}): Request {
  const req = {} as Request;
  if (overrides.baseUrl !== undefined) req.baseUrl = overrides.baseUrl;
  if (overrides.routePath !== undefined) {
    req.route = { path: overrides.routePath } as Request["route"];
  }
  return req;
}

describe("resolveRouteTemplate", () => {
  it("combines base URL and route pattern into a normalized template", () => {
    const req = makeReq({ baseUrl: "/api/v1/groups", routePath: "/:id" });
    expect(resolveRouteTemplate(req)).toBe("/api/v1/groups/:id");
  });

  it("keeps nested route patterns intact", () => {
    const req = makeReq({ baseUrl: "/api/v1/groups", routePath: "/:id/members" });
    expect(resolveRouteTemplate(req)).toBe("/api/v1/groups/:id/members");
  });

  it("normalizes a trailing slash on the mounted base", () => {
    const req = makeReq({ baseUrl: "/health", routePath: "/" });
    expect(resolveRouteTemplate(req)).toBe("/health");
  });

  it("preserves the root path", () => {
    const req = makeReq({ baseUrl: "", routePath: "/" });
    expect(resolveRouteTemplate(req)).toBe("/");
  });

  it("falls back to the bounded unmatched label when no route matched", () => {
    expect(resolveRouteTemplate(makeReq())).toBe(UNMATCHED_ROUTE);
    expect(UNMATCHED_ROUTE).toBe("unmatched");
  });

  it("echoes the Express route template, never a concrete parameter value", () => {
    // In practice Express populates req.route.path with the `:param` template,
    // so a concrete id in the URL is already gone by the time we render labels.
    const req = makeReq({ baseUrl: "/api/v1/groups", routePath: "/:id" });
    expect(resolveRouteTemplate(req)).toBe("/api/v1/groups/:id");
    expect(resolveRouteTemplate(req)).not.toContain("12345-abcd");
  });
});
