import { describe, it, expect, beforeEach } from "vitest";

import { MetricsRegistry } from "../src/metrics/registry.js";

describe("MetricsRegistry counters", () => {
  let registry: MetricsRegistry;

  beforeEach(() => {
    registry = new MetricsRegistry();
    registry.defineCounter({
      kind: "counter",
      name: "test_requests_total",
      help: "Total test requests",
      labelKeys: ["method", "route"],
    });
  });

  it("increments a defined counter", () => {
    registry.increment("test_requests_total");
    expect(registry.counterValue("test_requests_total")).toBe(1);
  });

  it("records label-combination series independently", () => {
    registry.increment("test_requests_total", { method: "GET", route: "/a" });
    registry.increment("test_requests_total", { method: "GET", route: "/a" });
    registry.increment("test_requests_total", { method: "POST", route: "/b" });

    expect(registry.counterValue("test_requests_total", { method: "GET", route: "/a" })).toBe(2);
    expect(registry.counterValue("test_requests_total", { method: "POST", route: "/b" })).toBe(1);
    expect(registry.counterValue("test_requests_total", { method: "GET", route: "/b" })).toBe(0);
  });

  it("ignores label keys that were not declared for the metric", () => {
    registry.increment("test_requests_total", { method: "GET", route: "/a", userId: "u-123" });

    const withUnrelated = registry.counterValue("test_requests_total", {
      method: "GET",
      route: "/a",
      userId: "u-999",
    });
    const without = registry.counterValue("test_requests_total", { method: "GET", route: "/a" });
    expect(withUnrelated).toBe(1);
    expect(without).toBe(1);
  });

  it("is a safe no-op for unknown metrics and non-positive increments", () => {
    registry.increment("does_not_exist", {}, 5);
    registry.increment("test_requests_total", {}, 0);
    registry.increment("test_requests_total", {}, -1);

    expect(registry.counterValue("does_not_exist")).toBe(0);
    expect(registry.counterValue("test_requests_total")).toBe(0);
  });

  it("rejects malformed metric names", () => {
    registry.defineCounter({ kind: "counter", name: "bad name!", help: "x" });
    registry.increment("bad name!");
    expect(registry.counterValue("bad name!")).toBe(0);
  });

  it("renders HELP, TYPE, and value lines", () => {
    registry.increment("test_requests_total", { method: "POST", route: "/a" });

    const rendered = registry.renderPrometheus();
    expect(rendered).toContain("# HELP test_requests_total Total test requests");
    expect(rendered).toContain("# TYPE test_requests_total counter");
    expect(rendered).toContain(`test_requests_total{method="POST",route="/a"} 1`);
  });

  it("escapes label values to prevent label injection", () => {
    registry.increment("test_requests_total", { method: "GET", route: 'x"y' });

    const rendered = registry.renderPrometheus();
    expect(rendered).toContain(`test_requests_total{method="GET",route="x\\"y"} 1`);
    expect(rendered).not.toContain('route="x"y"');
    expect(rendered).not.toContain('route="x\\ny"');
  });
});

describe("MetricsRegistry histograms", () => {
  let registry: MetricsRegistry;

  beforeEach(() => {
    registry = new MetricsRegistry();
    registry.defineHistogram({
      kind: "histogram",
      name: "test_latency_seconds",
      help: "Test latency",
      buckets: [0.1, 0.5, 1],
      labelKeys: ["method"],
    });
  });

  it("distributes observations into buckets and accumulates the sum", () => {
    registry.observe("test_latency_seconds", 0.05);
    registry.observe("test_latency_seconds", 0.3);
    registry.observe("test_latency_seconds", 5);

    expect(registry.histogramCount("test_latency_seconds")).toBe(3);
    expect(registry.histogramSum("test_latency_seconds")).toBeCloseTo(5.35);
  });

  it("renders cumulative buckets, +Inf, sum, and count", () => {
    registry.observe("test_latency_seconds", 0.05);
    registry.observe("test_latency_seconds", 0.3);

    const rendered = registry.renderPrometheus();
    expect(rendered).toContain("# TYPE test_latency_seconds histogram");
    expect(rendered).toContain(`test_latency_seconds_bucket{le="0.1"} 1`);
    expect(rendered).toContain(`test_latency_seconds_bucket{le="0.5"} 2`);
    expect(rendered).toContain(`test_latency_seconds_bucket{le="1"} 2`);
    expect(rendered).toContain(`test_latency_seconds_bucket{le="+Inf"} 2`);
    expect(rendered).toContain(`test_latency_seconds_sum 0.35`);
    expect(rendered).toContain(`test_latency_seconds_count 2`);
  });

  it("records histogram series per label combination", () => {
    registry.observe("test_latency_seconds", 0.5, { method: "GET" });
    registry.observe("test_latency_seconds", 0.5, { method: "POST" });

    expect(registry.histogramCount("test_latency_seconds", { method: "GET" })).toBe(1);
    expect(registry.histogramCount("test_latency_seconds", { method: "POST" })).toBe(1);
  });

  it("is a safe no-op for invalid observations", () => {
    registry.observe("test_latency_seconds", -1);
    registry.observe("test_latency_seconds", Number.NaN);
    registry.observe("test_latency_seconds", Number.POSITIVE_INFINITY);
    registry.observe("unknown_histogram", 1);

    expect(registry.histogramCount("test_latency_seconds")).toBe(0);
    expect(registry.histogramSum("test_latency_seconds")).toBe(0);
  });
});

describe("MetricsRegistry reset", () => {
  it("clears values but keeps the defined catalog", () => {
    const registry = new MetricsRegistry();
    registry.defineCounter({ kind: "counter", name: "keep_me_total", help: "h" });
    registry.increment("keep_me_total", {}, 3);

    registry.reset();

    expect(registry.counterValue("keep_me_total")).toBe(0);
    registry.increment("keep_me_total", {}, 1);
    expect(registry.counterValue("keep_me_total")).toBe(1);
    expect(registry.renderPrometheus()).toContain("# TYPE keep_me_total counter");
  });
});
