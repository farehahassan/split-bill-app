import { describe, it, expect, beforeEach, vi } from "vitest";

import { GroupCache } from "../src/modules/groups/group.cache.js";
import type { CacheStore } from "../src/redis/cacheStore.js";
import { METRIC, METRIC_LABEL, resetMetrics, metrics } from "../src/metrics/registry.js";
import { APP_ERRORS } from "../src/constants/app-errors.js";

vi.mock("@prisma/client", async (importOriginal) => {
  const original = await importOriginal<typeof import("@prisma/client")>();
  return {
    ...original,
    PrismaClient: vi.fn(() => ({
      $connect: vi.fn(),
      $queryRaw: vi.fn(),
      $disconnect: vi.fn(),
      group: { findUnique: vi.fn() },
      groupMember: { findUnique: vi.fn() },
      groupSummary: { upsert: vi.fn(), findUnique: vi.fn() },
    })),
  };
});

vi.mock("../src/queues/jobQueue.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/queues/jobQueue.js")>();
  return {
    ...original,
    getJobQueue: vi.fn(),
  };
});

import { prisma, connectDatabase } from "../src/db/prisma.js";
import { getJobQueue } from "../src/queues/jobQueue.js";
import { SummaryService } from "../src/modules/summary/summary.service.js";
import { SummaryRepository } from "../src/modules/summary/summary.repository.js";

const mockPrisma = vi.mocked(prisma);
const mockGetJobQueue = vi.mocked(getJobQueue);

const group = { id: "group-1", name: "Trip to Naran", createdById: "owner-1" };

function groupWithMembers() {
  return {
    id: "group-1",
    name: "Trip to Naran",
    createdById: "owner-1",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    members: [{ id: "owner-1", name: "Owner", email: "owner@example.com" }],
  };
}

beforeEach(() => {
  resetMetrics();
  vi.clearAllMocks();
});

function failingStore(): CacheStore {
  return {
    get: vi.fn().mockRejectedValue(new Error("redis down")),
    set: vi.fn().mockRejectedValue(new Error("redis down")),
    delete: vi.fn().mockRejectedValue(new Error("redis down")),
  } as CacheStore;
}

describe("Cache failure metrics", () => {
  it("absorbs a read failure as a miss and counts it", async () => {
    const cache = new GroupCache(failingStore(), 60);

    const result = await cache.getCachedGroupById("group-1");

    expect(result).toBeNull();
    expect(
      metrics.counterValue(METRIC.cacheFailuresTotal, { [METRIC_LABEL.operation]: "get" }),
    ).toBe(1);
  });

  it("absorbs a write failure without throwing and counts it", async () => {
    const cache = new GroupCache(failingStore(), 60);

    await expect(cache.setCachedGroupById("group-1", {} as never)).resolves.toBeUndefined();

    expect(
      metrics.counterValue(METRIC.cacheFailuresTotal, { [METRIC_LABEL.operation]: "set" }),
    ).toBe(1);
  });

  it("absorbs an invalidation failure and counts it", async () => {
    const cache = new GroupCache(failingStore(), 60);

    await expect(cache.invalidateGroupCache("group-1")).resolves.toBeUndefined();

    expect(
      metrics.counterValue(METRIC.cacheFailuresTotal, { [METRIC_LABEL.operation]: "delete" }),
    ).toBe(1);
  });

  it("does not count successful cache operations", async () => {
    const store: CacheStore = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    } as CacheStore;
    const cache = new GroupCache(store, 60);

    await cache.getCachedGroupById("group-1");
    await cache.setCachedGroupById("group-1", groupWithMembers() as never);
    await cache.invalidateGroupCache("group-1");

    expect(
      metrics.counterValue(METRIC.cacheFailuresTotal, { [METRIC_LABEL.operation]: "get" }),
    ).toBe(0);
    expect(
      metrics.counterValue(METRIC.cacheFailuresTotal, { [METRIC_LABEL.operation]: "set" }),
    ).toBe(0);
    expect(
      metrics.counterValue(METRIC.cacheFailuresTotal, { [METRIC_LABEL.operation]: "delete" }),
    ).toBe(0);
  });
});

describe("Queue failure metrics", () => {
  it("increments queue_failures_total and still fails the request when enqueue fails", async () => {
    mockGetJobQueue.mockReturnValue({
      enqueue: vi.fn().mockRejectedValue(new Error("redis down")),
    } as never);
    mockPrisma.group.findUnique.mockResolvedValue(group);
    mockPrisma.groupMember.findUnique.mockResolvedValue({ id: "membership-1" });

    const service = new SummaryService(new SummaryRepository());

    await expect(
      service.enqueueGroupSummaryRecompute("alice-1", "group-1", "req-1"),
    ).rejects.toMatchObject({ code: APP_ERRORS.JOB_ENQUEUE_FAILED });

    expect(metrics.counterValue(METRIC.queueFailuresTotal)).toBe(1);
  });
});

describe("Database connection metrics", () => {
  it("increments database_connection_errors_total and rethrows on failure", async () => {
    mockPrisma.$connect.mockRejectedValue(new Error("connection refused"));

    await expect(connectDatabase()).rejects.toThrow("connection refused");

    expect(metrics.counterValue(METRIC.databaseConnectionErrorsTotal)).toBe(1);
  });

  it("does not count a successful connection", async () => {
    mockPrisma.$connect.mockResolvedValue();
    mockPrisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);

    await expect(connectDatabase()).resolves.toBeUndefined();

    expect(metrics.counterValue(METRIC.databaseConnectionErrorsTotal)).toBe(0);
  });
});

describe("Observability catalog", () => {
  it("registers every metric family in the rendered output", () => {
    const rendered = metrics.renderPrometheus();

    for (const name of [
      "http_requests_total",
      "http_errors_total",
      "http_request_duration_seconds",
      "users_registered_total",
      "groups_created_total",
      "expenses_created_total",
      "expenses_updated_total",
      "expenses_deleted_total",
      "settlements_created_total",
      "activity_events_created_total",
      "background_jobs_succeeded_total",
      "background_jobs_failed_total",
      "background_jobs_retried_total",
      "background_jobs_discarded_total",
      "redis_connection_errors_total",
      "cache_failures_total",
      "queue_failures_total",
      "database_connection_errors_total",
    ]) {
      const kind = name === "http_request_duration_seconds" ? "histogram" : "counter";
      expect(rendered).toContain(`# TYPE ${name} ${kind}`);
    }
  });
});