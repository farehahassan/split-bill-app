import { prisma } from "../../db/prisma.js";

/**
 * Aggregated, derived numbers for a group. These are computed by the
 * background worker and stored in `GroupSummary`; the authoritative source of
 * truth remains the group's expenses, settlements, and memberships in
 * PostgreSQL.
 */
export interface GroupSummaryMetrics {
  totalSpentMinorUnits: bigint;
  expenseCount: number;
  settlementCount: number;
  memberCount: number;
}

export interface GroupSummaryRecord {
  id: string;
  groupId: string;
  totalSpentMinorUnits: bigint;
  expenseCount: number;
  settlementCount: number;
  memberCount: number;
  currencyCode: string;
  computedAt: Date;
}

const safeGroupSelect = {
  id: true,
  name: true,
  createdById: true,
} as const;

/**
 * Reads and writes the derived group-summary snapshot. The aggregates are
 * recomputed from the authoritative tables on every job run, and the write is a
 * single-row upsert keyed on the unique `groupId` — which is what makes the
 * recompute idempotent: running it once or N times produces the same row.
 */
export class SummaryRepository {
  findGroupById(id: string): Promise<{ id: string; name: string; createdById: string } | null> {
    return prisma.group.findUnique({
      where: { id },
      select: safeGroupSelect,
    });
  }

  isGroupMember(groupId: string, userId: string): Promise<boolean> {
    return prisma.groupMember
      .findUnique({
        where: {
          groupId_userId: {
            groupId,
            userId,
          },
        },
        select: {
          id: true,
        },
      })
      .then((member) => member !== null);
  }

  /**
   * Computes the summary metrics for a group directly from the authoritative
   * tables. The expense sum falls back to `0n` when the group has no expenses.
   */
  async aggregateGroup(groupId: string): Promise<GroupSummaryMetrics> {
    const [expenseAggregate, expenseCount, settlementCount, memberCount] = await Promise.all([
      prisma.expense.aggregate({
        where: { groupId },
        _sum: { amountMinorUnits: true },
      }),
      prisma.expense.count({ where: { groupId } }),
      prisma.settlement.count({ where: { groupId } }),
      prisma.groupMember.count({ where: { groupId } }),
    ]);

    return {
      totalSpentMinorUnits: expenseAggregate._sum.amountMinorUnits ?? 0n,
      expenseCount,
      settlementCount,
      memberCount,
    };
  }

  /**
   * Atomically creates or refreshes the group's summary snapshot. Idempotent by
   * construction (a unique `groupId`, a single upsert).
   */
  async upsertSummary(
    groupId: string,
    metrics: GroupSummaryMetrics,
    computedAt: Date,
  ): Promise<GroupSummaryRecord> {
    return prisma.groupSummary.upsert({
      where: { groupId },
      update: {
        totalSpentMinorUnits: metrics.totalSpentMinorUnits,
        expenseCount: metrics.expenseCount,
        settlementCount: metrics.settlementCount,
        memberCount: metrics.memberCount,
        computedAt,
      },
      create: {
        groupId,
        totalSpentMinorUnits: metrics.totalSpentMinorUnits,
        expenseCount: metrics.expenseCount,
        settlementCount: metrics.settlementCount,
        memberCount: metrics.memberCount,
        currencyCode: "PKR",
        computedAt,
      },
    });
  }

  findSummaryByGroupId(groupId: string): Promise<GroupSummaryRecord | null> {
    return prisma.groupSummary.findUnique({
      where: { groupId },
    });
  }
}
