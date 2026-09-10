import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";

import { createApp } from "../src/app.js";
import { loadEnv, resetEnv } from "../src/config/env.js";
import { HTTP_STATUSES } from "../src/constants/http-statuses.js";
import { METRIC, resetMetrics, metrics } from "../src/metrics/registry.js";

beforeEach(() => {
  resetEnv();
  resetMetrics();
});

describe("HTTP request metrics", () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    app = createApp();
  });

  it("records total requests with method, normalized route, and status class", async () => {
    await request(app).get("/health").expect(HTTP_STATUSES.OK);

    expect(
      metrics.counterValue(METRIC.httpRequestsTotal, {
        method: "GET",
        route: "/health",
        status: "2xx",
      }),
    ).toBe(1);
  });

  it("records the HTTP method for non-GET requests", async () => {
    await request(app)
      .post("/api/v1/auth/register")
      .send({ name: "A", email: "not-an-email", password: "short" });

    expect(
      metrics.counterValue(METRIC.httpRequestsTotal, {
        method: "POST",
        route: "/api/v1/auth/register",
        status: "4xx",
      }),
    ).toBe(1);
  });

  it("records request duration as a histogram with method and route", async () => {
    await request(app).get("/health").expect(HTTP_STATUSES.OK);

    const total = metrics.histogramCount(METRIC.httpRequestDurationSeconds, {
      method: "GET",
      route: "/health",
    });
    const sum = metrics.histogramSum(METRIC.httpRequestDurationSeconds, {
      method: "GET",
      route: "/health",
    });

    expect(total).toBe(1);
    expect(sum).toBeGreaterThan(0);
  });

  it("normalizes parameterized routes so IDs never become labels", async () => {
    const rawId = "group-9f8e7-high-cardinality";

    await request(app).get(`/api/v1/groups/${rawId}`).expect(HTTP_STATUSES.UNAUTHORIZED);

    expect(
      metrics.counterValue(METRIC.httpRequestsTotal, {
        method: "GET",
        route: "/api/v1/groups/:id",
        status: "4xx",
      }),
    ).toBe(1);
    expect(
      metrics.counterValue(METRIC.httpRequestsTotal, {
        method: "GET",
        route: `/api/v1/groups/${rawId}`,
        status: "4xx",
      }),
    ).toBe(0);

    const rendered = metrics.renderPrometheus();
    expect(rendered).not.toContain(rawId);
  });

  it("counts error responses separately via http_errors_total", async () => {
    await request(app).get("/api/v1/auth/me").expect(HTTP_STATUSES.UNAUTHORIZED);

    expect(
      metrics.counterValue(METRIC.httpErrorsTotal, {
        method: "GET",
        route: "/api/v1/auth/me",
        status: "4xx",
      }),
    ).toBe(1);
  });

  it("maps unmatched 404s onto the bounded unmatched route label", async () => {
    await request(app).get("/definitely-not-a-route").expect(HTTP_STATUSES.NOT_FOUND);

    expect(
      metrics.counterValue(METRIC.httpRequestsTotal, {
        method: "GET",
        route: "unmatched",
        status: "4xx",
      }),
    ).toBe(1);
    expect(
      metrics.counterValue(METRIC.httpErrorsTotal, {
        method: "GET",
        route: "unmatched",
        status: "4xx",
      }),
    ).toBe(1);
  });
});

describe("Metrics endpoint", () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    app = createApp();
  });

  it("serves Prometheus text format with the metric catalog", async () => {
    await request(app).get("/health");

    const res = await request(app).get("/metrics").expect(HTTP_STATUSES.OK);

    expect(res.headers["content-type"]).toContain("text/plain");
    expect(res.text).toContain("# TYPE http_requests_total counter");
    expect(res.text).toContain('http_requests_total{method="GET",route="/health",status="2xx"} 1');
    expect(res.text).toContain("# TYPE users_registered_total counter");
  });

  it("does not expose request IDs or sensitive values", async () => {
    const res = await request(app).get("/health");
    const requestId = String(res.headers["x-request-id"]);

    const metricsBody = (await request(app).get("/metrics")).text;

    expect(metricsBody).not.toContain(requestId);
    expect(metricsBody).not.toContain("password");
    expect(metricsBody).not.toContain("authorization");
    expect(metricsBody).not.toContain("bearer");
    expect(metricsBody.toLowerCase()).not.toContain("refresh_token");
    expect(metricsBody.toLowerCase()).not.toContain("jwt_secret");
  });

  it("is disabled when METRICS_ENABLED=false", async () => {
    process.env.METRICS_ENABLED = "false";
    resetEnv();
    try {
      app = createApp();
      expect(loadEnv().METRICS_ENABLED).toBe("false");
      await request(app).get("/metrics").expect(HTTP_STATUSES.NOT_FOUND);
    } finally {
      delete process.env.METRICS_ENABLED;
      resetEnv();
    }
  });
});

describe("Observability failure safety", () => {
  it("keeps serving responses even when metric recording is broken", async () => {
    vi.spyOn(metrics, "increment").mockImplementation(() => {
      throw new Error("metrics backend exploded");
    });
    vi.spyOn(metrics, "observe").mockImplementation(() => {
      throw new Error("metrics backend exploded");
    });

    const app = createApp();
    try {
      const res = await request(app).get("/health").expect(HTTP_STATUSES.OK);
      expect(res.headers["x-request-id"]).toBeDefined();
    } finally {
      vi.restoreAllMocks();
    }
  });
});
