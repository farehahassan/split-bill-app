import type { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import type { ExpenseForBalance, SettlementForBalance } from "./balance.util.js";

export interface SafeUser {
  id: string;
  name: string;
  email: string;
}

export interface GroupMemberUser {
  userId: string;
  user: SafeUser;
}

export interface SettlementCreateData {
  groupId: string;
  payerId: string;
  payeeId: string;
  amountMinorUnits: bigint;
  currencyCode: string;
  settledAt: Date;
}

export interface SettlementRecord {
  id: string;
  groupId: string;
  payerId: string;
  payeeId: string;
  amountMinorUnits: bigint;
  currencyCode: string;
  settledAt: Date;
  createdAt: Date;
  updatedAt: Date;
  payer: SafeUser;
  payee: SafeUser;
}

const safeUserSelect = {
  id: true,
  name: true,
  email: true,
} satisfies Prisma.UserSelect;

const settlementInclude = {
  payer: { select: safeUserSelect },
  payee: { select: safeUserSelect },
} satisfies Prisma.SettlementInclude;

export class SettlementRepository {
  findGroupById(id: string): Promise<{ id: string; name: string; createdById: string } | null> {
    return prisma.group.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        createdById: true,
      },
    });
  }

  /**
   * Returns the group's members together with their safe public user fields.
   * Used to build the balances response (including zero-balance members) and to
   * authorize the requester without issuing a separate membership query.
   */
  async findGroupMembers(groupId: string): Promise<GroupMemberUser[]> {
    return prisma.groupMember.findMany({
      where: { groupId },
      select: {
        userId: true,
        user: { select: safeUserSelect },
      },
      orderBy: { createdAt: "asc" },
    });
  }

  /**
   * Fetches every expense (and its splits) belonging to the group as the raw
   * input expected by the balance calculation.
   */
  async findExpensesForBalances(groupId: string): Promise<ExpenseForBalance[]> {
    const expenses = await prisma.expense.findMany({
      where: { groupId },
      select: {
        paidById: true,
        amountMinorUnits: true,
        splits: {
          select: {
            userId: true,
            amountMinorUnits: true,
          },
        },
      },
    });

    return expenses.map((expense) => ({
      paidById: expense.paidById,
      amountMinorUnits: expense.amountMinorUnits,
      splits: expense.splits.map((split) => ({
        userId: split.userId,
        amountMinorUnits: split.amountMinorUnits,
      })),
    }));
  }

  /**
   * Fetches every settlement belonging to the group as the raw input expected
   * by the balance calculation.
   */
  async findSettlementsForBalances(groupId: string): Promise<SettlementForBalance[]> {
    const settlements = await prisma.settlement.findMany({
      where: { groupId },
      select: {
        payerId: true,
        payeeId: true,
        amountMinorUnits: true,
      },
    });

    return settlements;
  }

  async createSettlement(data: SettlementCreateData): Promise<SettlementRecord> {
    const settlement = await prisma.settlement.create({
      data: {
        groupId: data.groupId,
        payerId: data.payerId,
        payeeId: data.payeeId,
        amountMinorUnits: data.amountMinorUnits,
        currencyCode: data.currencyCode,
        settledAt: data.settledAt,
      },
      include: settlementInclude,
    });

    return settlement;
  }

  findSettlementById(id: string): Promise<SettlementRecord | null> {
    return prisma.settlement.findUnique({
      where: { id },
      include: settlementInclude,
    });
  }

  findSettlementsByGroupId(groupId: string): Promise<SettlementRecord[]> {
    return prisma.settlement.findMany({
      where: { groupId },
      orderBy: { settledAt: "desc" },
      include: settlementInclude,
    });
  }
}
