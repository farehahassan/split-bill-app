import type { Expense, ExpenseSplit, Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";

export interface ExpenseCreateSplit {
  userId: string;
  amountMinorUnits: bigint;
}

export interface CreateExpenseData {
  groupId: string;
  paidById: string;
  description: string;
  amountMinorUnits: bigint;
  currencyCode: string;
  splitType: "EQUAL" | "EXACT";
  expenseDate: Date;
  splits: ExpenseCreateSplit[];
}

export interface SafeUser {
  id: string;
  name: string;
  email: string;
}

export interface ExpenseWithDetails extends Expense {
  payer: SafeUser;
  splits: Array<ExpenseSplit & { user: SafeUser }>;
}

export interface ExpenseWithSummary extends Expense {
  payer: SafeUser;
  splitCount: number;
}

const safeUserSelect = {
  id: true,
  name: true,
  email: true,
} satisfies Prisma.UserSelect;

export class ExpenseRepository {
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

  async findGroupMemberIds(groupId: string): Promise<string[]> {
    const members = await prisma.groupMember.findMany({
      where: { groupId },
      select: { userId: true },
    });
    return members.map((member) => member.userId);
  }

  /**
   * Creates an expense and all of its splits atomically. The nested `splits`
   * create is executed as part of the single `expense.create` write inside the
   * transaction, so either the expense and every split persist or none do.
   */
  async createExpenseWithSplits(data: CreateExpenseData): Promise<ExpenseWithDetails> {
    return prisma.$transaction(async (tx) => {
      const expense = await tx.expense.create({
        data: {
          groupId: data.groupId,
          paidById: data.paidById,
          description: data.description,
          amountMinorUnits: data.amountMinorUnits,
          currencyCode: data.currencyCode,
          splitType: data.splitType,
          expenseDate: data.expenseDate,
          splits: {
            create: data.splits.map((split) => ({
              userId: split.userId,
              amountMinorUnits: split.amountMinorUnits,
            })),
          },
        },
        include: {
          payer: { select: safeUserSelect },
          splits: {
            include: { user: { select: safeUserSelect } },
          },
        },
      });

      return expense;
    });
  }

  findExpenseById(id: string): Promise<ExpenseWithDetails | null> {
    return prisma.expense.findUnique({
      where: { id },
      include: {
        payer: { select: safeUserSelect },
        splits: {
          include: { user: { select: safeUserSelect } },
          orderBy: { createdAt: "asc" },
        },
      },
    });
  }

  async findExpensesByGroupId(groupId: string): Promise<ExpenseWithSummary[]> {
    const expenses = await prisma.expense.findMany({
      where: { groupId },
      orderBy: { createdAt: "desc" },
      include: {
        payer: { select: safeUserSelect },
        _count: { select: { splits: true } },
      },
    });

    return expenses.map((expense) => ({
      id: expense.id,
      groupId: expense.groupId,
      paidById: expense.paidById,
      description: expense.description,
      amountMinorUnits: expense.amountMinorUnits,
      currencyCode: expense.currencyCode,
      splitType: expense.splitType,
      expenseDate: expense.expenseDate,
      createdAt: expense.createdAt,
      updatedAt: expense.updatedAt,
      payer: expense.payer,
      splitCount: expense._count.splits,
    }));
  }
}
