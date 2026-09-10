import type { Expense, ExpenseSplit, Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { createActivityEvent, type ActivityEventInput } from "../activity/activity.repository.js";

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
   * Creates an expense, all of its splits, and the expense-added activity event
   * atomically. The nested `splits` create is executed as part of the single
   * `expense.create` write inside the transaction, and the activity event is
   * written by the same transaction, so either the expense, its splits, and the
   * event persist together or none do.
   */
  async createExpenseWithSplits(
    data: CreateExpenseData,
    activity: ActivityEventInput,
  ): Promise<ExpenseWithDetails> {
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

      await createActivityEvent(tx, {
        groupId: expense.groupId,
        userId: activity.userId,
        type: activity.type,
        message: activity.message,
        amountMinorUnits: expense.amountMinorUnits,
        currencyCode: expense.currencyCode,
        occurredAt: expense.createdAt,
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

  /**
   * Returns the group's expenses, newest first, with the payer and split count.
   *
   * Without `pagination` the full list is returned (legacy behavior). When
   * pagination is supplied the query applies skip/take at the database level,
   * adds an `id` tie-breaker for a deterministic page order, and returns the
   * matching total for the pagination metadata.
   */
  async findExpensesByGroupId(
    groupId: string,
    pagination?: { page: number; limit: number },
  ): Promise<{ expenses: ExpenseWithSummary[]; total?: number }> {
    const where = { groupId };
    const include = {
      payer: { select: safeUserSelect },
      _count: { select: { splits: true } },
    } satisfies Prisma.ExpenseInclude;

    const mapRow = (expense: Prisma.ExpenseGetPayload<{ include: typeof include }>) => ({
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
    });

    if (!pagination) {
      const expenses = await prisma.expense.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include,
      });
      return { expenses: expenses.map(mapRow) };
    }

    const [expenses, total] = await Promise.all([
      prisma.expense.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
        include,
      }),
      prisma.expense.count({ where }),
    ]);

    return { expenses: expenses.map(mapRow), total };
  }
}
