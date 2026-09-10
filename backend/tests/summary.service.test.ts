import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../src/db/prisma.js", async () => {
  return {
    prisma: {
      group: { findUnique: vi.fn() },
      groupMember: { findUnique: vi.fn(), count: vi.fn() },
      expense: { aggregate: vi.fn(), count: vi.fn() },
      settlement: { count: vi.fn() },
      groupSummary: { upsert: vi.fn(), findUnique: vi.fn() },
    },
  };
});

vi.mock("../src/queues/jobQueue.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/queues/jobQueue.js")>();
  return {
    ...original,
    getJobQueue: vi.fn(),
  };
});

import { prisma } from "../src/db/prisma.js";
import { APP_ERRORS } from "../src/constants/app-errors.js";
import { HTTP_STATUSES } from "../src/constants/http-statuses.js";
import { JOB_TYPES } from "../src/queues/job.types.js";
import { getJobQueue } from "../src/queues/jobQueue.js";
import {
  SummaryService,
  enqueueGroupSummaryRecomputeJob,
} from "../src/modules/summary/summary.service.js";
import { SummaryRepository } from "../src/modules/summary/summary.repository.js";

const mockPrisma = vi.mocked(prisma);
const mockGetJobQueue = vi.mocked(getJobQueue);

const group = { id: "group-1", name: "Trip to Naran", createdById: "owner-1" };

async function makeService(): Promise<SummaryService> {
  return new SummaryService(new SummaryRepository());
}

function storedSummary(overrides: Record<string, unknown> = {}) {
  return {
    id: "summary-1",
    groupId: "group-1",
    totalSpentMinorUnits: 1000n,
    expenseCount: 3,
    settlementCount: 2,
    memberCount: 4,
    currencyCode: "PKR",
    computedAt: new Date("2026-09-09T12:00:00Z"),
    createdAt: new Date("2026-09-09T12:00:00Z"),
    updatedAt: new Date("2026-09-09T12:00:00Z"),
    ...overrides,
  };
}

function memberRow() {
  return { id: "membership-1" };
}

function fakeQueue(overrides: { enqueue?: ReturnType<typeof vi.fn> } = {}) {
  return {
    enqueue:
      overrides.enqueue ??
      vi.fn().mockResolvedValue({
        jobId: "job-1",
        type: JOB_TYPES.GROUP_SUMMARY_RECOMPUTE,
        status: "queued",
      }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetJobQueue.mockReturnValue(fakeQueue() as never);
});

describe("SummaryService.getGroupSummary", () => {
  it("returns the latest snapshot to a group member", async () => {
    mockPrisma.group.findUnique.mockResolvedValue(group);
    mockPrisma.groupMember.findUnique.mockResolvedValue(memberRow());
    mockPrisma.groupSummary.findUnique.mockResolvedValue(storedSummary());

    const service = await makeService();
    const summary = await service.getGroupSummary("alice-1", "group-1");

    expect(summary).toMatchObject({
      id: "summary-1",
      groupId: "group-1",
      totalSpentMinorUnits: 1000,
      expenseCount: 3,
      settlementCount: 2,
      memberCount: 4,
      currencyCode: "PKR",
    });
    expect(mockPrisma.groupSummary.findUnique).toHaveBeenCalledWith({
      where: { groupId: "group-1" },
    });
  });

  it("throws GROUP_SUMMARY_NOT_FOUND when no snapshot exists yet", async () => {
    mockPrisma.group.findUnique.mockResolvedValue(group);
    mockPrisma.groupMember.findUnique.mockResolvedValue(memberRow());
    mockPrisma.groupSummary.findUnique.mockResolvedValue(null);

    const service = await makeService();

    await expect(service.getGroupSummary("alice-1", "group-1")).rejects.toMatchObject({
      code: APP_ERRORS.GROUP_SUMMARY_NOT_FOUND,
      statusCode: HTTP_STATUSES.NOT_FOUND,
    });
  });

  it("throws when the group does not exist", async () => {
    mockPrisma.group.findUnique.mockResolvedValue(null);

    const service = await makeService();

    await expect(service.getGroupSummary("alice-1", "missing")).rejects.toMatchObject({
      code: APP_ERRORS.GROUP_NOT_FOUND,
      statusCode: HTTP_STATUSES.NOT_FOUND,
    });
    expect(mockPrisma.groupSummary.findUnique).not.toHaveBeenCalled();
  });

  it("throws for a non-member", async () => {
    mockPrisma.group.findUnique.mockResolvedValue(group);
    mockPrisma.groupMember.findUnique.mockResolvedValue(null);

    const service = await makeService();

    await expect(service.getGroupSummary("outsider-1", "group-1")).rejects.toMatchObject({
      code: APP_ERRORS.NOT_GROUP_MEMBER,
      statusCode: HTTP_STATUSES.FORBIDDEN,
    });
  });
});

describe("SummaryService.enqueueGroupSummaryRecompute", () => {
  it("authorizes the member and returns a queued-job receipt", async () => {
    mockPrisma.group.findUnique.mockResolvedValue(group);
    mockPrisma.groupMember.findUnique.mockResolvedValue(memberRow());
    const queue = fakeQueue();
    mockGetJobQueue.mockReturnValue(queue as never);

    const service = await makeService();
    const queued = await service.enqueueGroupSummaryRecompute("alice-1", "group-1", "req-1");

    expect(queued).toEqual({
      jobId: "job-1",
      type: JOB_TYPES.GROUP_SUMMARY_RECOMPUTE,
      status: "queued",
    });
    expect(queue.enqueue).toHaveBeenCalledWith(
      JOB_TYPES.GROUP_SUMMARY_RECOMPUTE,
      { groupId: "group-1" },
      { requestId: "req-1" },
    );
  });

  it("never enqueues for a non-member", async () => {
    mockPrisma.group.findUnique.mockResolvedValue(group);
    mockPrisma.groupMember.findUnique.mockResolvedValue(null);
    const queue = fakeQueue();
    mockGetJobQueue.mockReturnValue(queue as never);

    const service = await makeService();

    await expect(
      service.enqueueGroupSummaryRecompute("outsider-1", "group-1"),
    ).rejects.toMatchObject({
      code: APP_ERRORS.NOT_GROUP_MEMBER,
      statusCode: HTTP_STATUSES.FORBIDDEN,
    });
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it("returns a clean 500 when the queue rejects the write", async () => {
    mockPrisma.group.findUnique.mockResolvedValue(group);
    mockPrisma.groupMember.findUnique.mockResolvedValue(memberRow());
    const queue = fakeQueue({
      enqueue: vi.fn().mockRejectedValue(new Error("Connection is closed.")),
    });
    mockGetJobQueue.mockReturnValue(queue as never);

    const service = await makeService();

    await expect(service.enqueueGroupSummaryRecompute("alice-1", "group-1")).rejects.toMatchObject({
      code: APP_ERRORS.JOB_ENQUEUE_FAILED,
      statusCode: HTTP_STATUSES.INTERNAL_SERVER_ERROR,
    });
  });
});

describe("SummaryService.recomputeGroupSummary", () => {
  it("aggregates and persists a fresh snapshot", async () => {
    mockPrisma.group.findUnique.mockResolvedValue(group);
    mockPrisma.expense.aggregate.mockResolvedValue({
      _sum: { amountMinorUnits: 2500n },
    } as never);
    mockPrisma.expense.count.mockResolvedValue(5);
    mockPrisma.settlement.count.mockResolvedValue(2);
    mockPrisma.groupMember.count.mockResolvedValue(4);
    mockPrisma.groupSummary.upsert.mockResolvedValue(
      storedSummary({ totalSpentMinorUnits: 2500n, expenseCount: 5 }),
    );

    const service = await makeService();
    const summary = await service.recomputeGroupSummary("group-1");

    expect(summary.totalSpentMinorUnits).toBe(2500);
    expect(summary.expenseCount).toBe(5);
    expect(mockPrisma.groupSummary.upsert).toHaveBeenCalledTimes(1);
  });

  it("throws for a group that no longer exists", async () => {
    mockPrisma.group.findUnique.mockResolvedValue(null);

    const service = await makeService();

    await expect(service.recomputeGroupSummary("gone")).rejects.toMatchObject({
      code: APP_ERRORS.GROUP_NOT_FOUND,
      statusCode: HTTP_STATUSES.NOT_FOUND,
    });
    expect(mockPrisma.groupSummary.upsert).not.toHaveBeenCalled();
  });
});

describe("enqueueGroupSummaryRecomputeJob (standalone)", () => {
  it("queues via the shared job queue", async () => {
    const queue = fakeQueue();
    mockGetJobQueue.mockReturnValue(queue as never);

    const queued = await enqueueGroupSummaryRecomputeJob("group-1", { requestId: "req-x" });

    expect(queued.jobId).toBe("job-1");
    expect(mockGetJobQueue).toHaveBeenCalledOnce();
  });
});
