import type { Expense, ExpenseSplit, Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import {
  createActivityEvent,
  type ActivityEventInput,
} from "../activity/activity.repository.js";

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
   * Updates an expense and atomically replaces its splits and the
   * expense-updated activity event. The split rows are removed and recreated
   * inside the same transaction (old split ids are not reused), so the
   * persisted split set always matches the merged inputs or nothing changes.
   */
  async updateExpenseWithSplits(
    expenseId: string,
    data: {
      paidById: string;
      description: string;
      amountMinorUnits: bigint;
      splitType: "EQUAL" | "EXACT";
      expenseDate: Date;
      splits: ExpenseCreateSplit[];
    },
    activity: ActivityEventInput,
  ): Promise<ExpenseWithDetails> {
    return prisma.$transaction(async (tx) => {
      const occurredAt = new Date();
      const expense = await tx.expense.update({
        where: { id: expenseId },
        data: {
          paidById: data.paidById,
          description: data.description,
          amountMinorUnits: data.amountMinorUnits,
          splitType: data.splitType,
          expenseDate: data.expenseDate,
          splits: {
            deleteMany: {},
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
        occurredAt,
      });

      return expense;
    });
  }

  /**
   * Deletes an expense (its splits cascade) and records the expense-deleted
   * activity event atomically. The event carries the amount and currency of
   * the deleted expense so the feed remains a faithful audit trail.
   */
  async deleteExpenseWithEvent(expenseId: string, activity: ActivityEventInput): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const expense = await tx.expense.delete({
        where: { id: expenseId },
      });

      await createActivityEvent(tx, {
        groupId: expense.groupId,
        userId: activity.userId,
        type: activity.type,
        message: activity.message,
        amountMinorUnits: expense.amountMinorUnits,
        currencyCode: expense.currencyCode,
        occurredAt: new Date(),
      });
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
