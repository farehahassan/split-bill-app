import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../src/db/prisma.js", async () => {
  return {
    prisma: {
      group: {
        findUnique: vi.fn(),
      },
      groupMember: {
        findUnique: vi.fn(),
        count: vi.fn(),
      },
      expense: {
        aggregate: vi.fn(),
        count: vi.fn(),
      },
      settlement: {
        count: vi.fn(),
      },
      groupSummary: {
        upsert: vi.fn(),
        findUnique: vi.fn(),
      },
    },
  };
});

import { prisma } from "../src/db/prisma.js";
import { SummaryRepository } from "../src/modules/summary/summary.repository.js";

const mockPrisma = vi.mocked(prisma);

const computedAt = new Date("2026-09-09T12:00:00Z");

function storedSummary(overrides: Record<string, unknown> = {}) {
  return {
    id: "summary-1",
    groupId: "group-1",
    totalSpentMinorUnits: 1000n,
    expenseCount: 3,
    settlementCount: 2,
    memberCount: 4,
    currencyCode: "PKR",
    computedAt,
    createdAt: computedAt,
    updatedAt: computedAt,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SummaryRepository.aggregateGroup", () => {
  it("computes totals and counts straight from the authoritative tables", async () => {
    mockPrisma.expense.aggregate.mockResolvedValue({
      _sum: { amountMinorUnits: 2500n },
    } as never);
    mockPrisma.expense.count.mockResolvedValue(5);
    mockPrisma.settlement.count.mockResolvedValue(2);
    mockPrisma.groupMember.count.mockResolvedValue(4);

    const repository = new SummaryRepository();
    const metrics = await repository.aggregateGroup("group-1");

    expect(metrics).toEqual({
      totalSpentMinorUnits: 2500n,
      expenseCount: 5,
      settlementCount: 2,
      memberCount: 4,
    });
    expect(mockPrisma.expense.aggregate).toHaveBeenCalledWith({
      where: { groupId: "group-1" },
      _sum: { amountMinorUnits: true },
    });
    expect(mockPrisma.expense.count).toHaveBeenCalledWith({
      where: { groupId: "group-1" },
    });
    expect(mockPrisma.settlement.count).toHaveBeenCalledWith({
      where: { groupId: "group-1" },
    });
    expect(mockPrisma.groupMember.count).toHaveBeenCalledWith({
      where: { groupId: "group-1" },
    });
  });

  it("falls back to zero when the group has no expenses", async () => {
    mockPrisma.expense.aggregate.mockResolvedValue({
      _sum: { amountMinorUnits: null },
    } as never);
    mockPrisma.expense.count.mockResolvedValue(0);
    mockPrisma.settlement.count.mockResolvedValue(0);
    mockPrisma.groupMember.count.mockResolvedValue(1);

    const repository = new SummaryRepository();
    const metrics = await repository.aggregateGroup("group-1");

    expect(metrics.totalSpentMinorUnits).toBe(0n);
    expect(metrics.expenseCount).toBe(0);
  });
});

describe("SummaryRepository.upsertSummary", () => {
  it("upserts on the unique groupId and returns the snapshot", async () => {
    mockPrisma.groupSummary.upsert.mockResolvedValue(storedSummary());

    const repository = new SummaryRepository();
    const summary = await repository.upsertSummary(
      "group-1",
      { totalSpentMinorUnits: 1000n, expenseCount: 3, settlementCount: 2, memberCount: 4 },
      computedAt,
    );

    expect(mockPrisma.groupSummary.upsert).toHaveBeenCalledWith({
      where: { groupId: "group-1" },
      update: {
        totalSpentMinorUnits: 1000n,
        expenseCount: 3,
        settlementCount: 2,
        memberCount: 4,
        computedAt,
      },
      create: {
        groupId: "group-1",
        totalSpentMinorUnits: 1000n,
        expenseCount: 3,
        settlementCount: 2,
        memberCount: 4,
        currencyCode: "PKR",
        computedAt,
      },
    });
    expect(summary.id).toBe("summary-1");
  });
});

describe("SummaryRepository lookups", () => {
  it("finds a group by id", async () => {
    mockPrisma.group.findUnique.mockResolvedValue({
      id: "group-1",
      name: "Trip",
      createdById: "owner-1",
    });

    const repository = new SummaryRepository();
    const group = await repository.findGroupById("group-1");

    expect(group?.createdById).toBe("owner-1");
    expect(mockPrisma.group.findUnique).toHaveBeenCalledWith({
      where: { id: "group-1" },
      select: { id: true, name: true, createdById: true },
    });
  });

  it("checks membership via the composite unique key", async () => {
    mockPrisma.groupMember.findUnique.mockResolvedValue({ id: "m-1" });

    const repository = new SummaryRepository();
    const isMember = await repository.isGroupMember("group-1", "alice-1");

    expect(isMember).toBe(true);
    expect(mockPrisma.groupMember.findUnique).toHaveBeenCalledWith({
      where: {
        groupId_userId: { groupId: "group-1", userId: "alice-1" },
      },
      select: { id: true },
    });
  });

  it("returns false when no membership rows exist", async () => {
    mockPrisma.groupMember.findUnique.mockResolvedValue(null);

    const repository = new SummaryRepository();
    await expect(repository.isGroupMember("group-1", "nobody")).resolves.toBe(false);
  });

  it("finds the latest summary snapshot by groupId", async () => {
    mockPrisma.groupSummary.findUnique.mockResolvedValue(storedSummary());

    const repository = new SummaryRepository();
    const summary = await repository.findSummaryByGroupId("group-1");

    expect(summary?.expenseCount).toBe(3);
    expect(mockPrisma.groupSummary.findUnique).toHaveBeenCalledWith({
      where: { groupId: "group-1" },
    });
  });
});
