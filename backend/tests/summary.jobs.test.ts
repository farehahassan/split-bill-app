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

import { prisma } from "../src/db/prisma.js";
import { PermanentJobFailureError } from "../src/queues/jobQueue.js";
import { JOB_TYPES } from "../src/queues/job.types.js";
import {
  groupSummaryPayloadSchema,
  groupSummaryRegistration,
  processGroupSummaryRecomputeJob,
} from "../src/modules/summary/summary.jobs.js";
import type { GroupSummaryPayload } from "../src/modules/summary/summary.jobs.js";

const mockPrisma = vi.mocked(prisma);

const group = { id: "group-1", name: "Trip to Naran", createdById: "owner-1" };

function jobEnvelope(payload: GroupSummaryPayload) {
  return {
    jobId: "job-1",
    type: JOB_TYPES.GROUP_SUMMARY_RECOMPUTE,
    payload,
    attempts: 0,
    createdAt: new Date().toISOString(),
    requestId: "req-1",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("groupSummaryPayloadSchema", () => {
  it("accepts a minimal groupId payload and rejects extras", () => {
    expect(groupSummaryPayloadSchema.parse({ groupId: "group-1" })).toEqual({ groupId: "group-1" });
    expect(() => groupSummaryPayloadSchema.parse({ groupId: " ", extra: 1 })).toThrow();
  });
});

describe("processGroupSummaryRecomputeJob", () => {
  it("recomputes and stores the group summary", async () => {
    mockPrisma.group.findUnique.mockResolvedValue(group);
    mockPrisma.expense.aggregate.mockResolvedValue({
      _sum: { amountMinorUnits: 2500n },
    } as never);
    mockPrisma.expense.count.mockResolvedValue(5);
    mockPrisma.settlement.count.mockResolvedValue(2);
    mockPrisma.groupMember.count.mockResolvedValue(4);
    mockPrisma.groupSummary.upsert.mockResolvedValue({ id: "summary-1" });

    await processGroupSummaryRecomputeJob(jobEnvelope({ groupId: "group-1" }));

    expect(mockPrisma.groupSummary.upsert).toHaveBeenCalledTimes(1);
  });

  it("fails permanently when the group has been deleted since enqueuing", async () => {
    mockPrisma.group.findUnique.mockResolvedValue(null);

    await expect(
      processGroupSummaryRecomputeJob(jobEnvelope({ groupId: "gone" })),
    ).rejects.toBeInstanceOf(PermanentJobFailureError);
    expect(mockPrisma.groupSummary.upsert).not.toHaveBeenCalled();
  });

  it("propagates datastore errors so the worker can retry with backoff", async () => {
    mockPrisma.group.findUnique.mockResolvedValue(group);
    mockPrisma.expense.aggregate.mockRejectedValue(new Error("db timeout"));

    await expect(
      processGroupSummaryRecomputeJob(jobEnvelope({ groupId: "group-1" })),
    ).rejects.toThrow("db timeout");
  });
});

describe("groupSummaryRegistration", () => {
  it("points the GROUP_SUMMARY_RECOMPUTE type at schema + handler", () => {
    expect(groupSummaryRegistration.type).toBe(JOB_TYPES.GROUP_SUMMARY_RECOMPUTE);
    expect(groupSummaryRegistration.schema).toBe(groupSummaryPayloadSchema);
  });
});
