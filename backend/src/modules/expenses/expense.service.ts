import { APP_ERRORS } from "../../constants/app-errors.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../errors/app.error.js";
import { METRIC, metrics } from "../../metrics/registry.js";
import {
  ExpenseRepository,
  type ExpenseWithDetails,
  type ExpenseWithSummary,
} from "./expense.repository.js";
import { calculateEqualSplits, sumSplitAmounts } from "./split.util.js";

type SplitDto = {
  id: string;
  userId: string;
  amountMinorUnits: number;
  user: { id: string; name: string; email: string };
};

type ExpenseDetailDto = {
  id: string;
  groupId: string;
  paidById: string;
  description: string;
  amountMinorUnits: number;
  currencyCode: string;
  splitType: "EQUAL" | "EXACT";
  expenseDate: Date;
  payer: { id: string; name: string; email: string };
  splits: SplitDto[];
  createdAt: Date;
  updatedAt: Date;
};

type ExpenseSummaryDto = {
  id: string;
  groupId: string;
  paidById: string;
  description: string;
  amountMinorUnits: number;
  currencyCode: string;
  splitType: "EQUAL" | "EXACT";
  expenseDate: Date;
  payer: { id: string; name: string; email: string };
  splitCount: number;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateExpenseInput = {
  groupId: string;
  description: string;
  amountMinorUnits: number;
  payerId: string;
  splitType: "EQUAL" | "EXACT";
  participants: Array<{ userId: string; amountMinorUnits?: number }>;
  expenseDate?: string;
};

export type UpdateExpenseInput = {
  description?: string;
  amountMinorUnits?: number;
  payerId?: string;
  splitType?: "EQUAL" | "EXACT";
  participants?: Array<{ userId: string; amountMinorUnits?: number }>;
  expenseDate?: string;
};

export class ExpenseService {
  constructor(private repository: ExpenseRepository) {}

  async createExpense(requesterId: string, input: CreateExpenseInput): Promise<ExpenseDetailDto> {
    const { groupId } = input;
    const totalMinorUnits = BigInt(input.amountMinorUnits);

    const group = await this.repository.findGroupById(groupId);
    if (!group) {
      throw new NotFoundError(APP_ERRORS.GROUP_NOT_FOUND, "Group not found.");
    }

    const memberIds = await this.repository.findGroupMemberIds(groupId);
    if (!memberIds.includes(requesterId)) {
      throw new ForbiddenError(APP_ERRORS.NOT_GROUP_MEMBER, "You are not a member of this group.");
    }

    if (!memberIds.includes(input.payerId)) {
      throw new ForbiddenError(
        APP_ERRORS.PAYER_NOT_GROUP_MEMBER,
        "The payer must be a member of the group.",
      );
    }

    const participantIds = input.participants.map((participant) => participant.userId);
    if (new Set(participantIds).size !== participantIds.length) {
      throw new BadRequestError(
        APP_ERRORS.DUPLICATE_SPLIT_USER,
        "A participant cannot appear more than once in the splits.",
      );
    }

    for (const participantId of participantIds) {
      if (!memberIds.includes(participantId)) {
        throw new ForbiddenError(
          APP_ERRORS.SPLIT_USER_NOT_GROUP_MEMBER,
          "Every split participant must be a member of the group.",
        );
      }
    }

    let splits: Array<{ userId: string; amountMinorUnits: bigint }>;
    if (input.splitType === "EQUAL") {
      splits = calculateEqualSplits(totalMinorUnits, participantIds);
    } else {
      const missingAmount = input.participants.some(
        (participant) => participant.amountMinorUnits === undefined,
      );
      if (missingAmount) {
        throw new BadRequestError(
          APP_ERRORS.SPLIT_TOTAL_MISMATCH,
          "Every EXACT participant must provide an amount.",
        );
      }

      splits = input.participants.map((participant) => ({
        userId: participant.userId,
        amountMinorUnits: BigInt(participant.amountMinorUnits as number),
      }));

      if (sumSplitAmounts(splits) !== totalMinorUnits) {
        throw new BadRequestError(
          APP_ERRORS.SPLIT_TOTAL_MISMATCH,
          "EXACT split amounts must sum to the expense total.",
        );
      }
    }

    const expense = await this.repository.createExpenseWithSplits(
      {
        groupId,
        paidById: input.payerId,
        description: input.description,
        amountMinorUnits: totalMinorUnits,
        currencyCode: "PKR",
        splitType: input.splitType,
        expenseDate: input.expenseDate ? new Date(input.expenseDate) : new Date(),
        splits,
      },
      {
        userId: requesterId,
        type: "EXPENSE_ADDED",
        message: `added the expense "${input.description}"`,
      },
    );

    metrics.increment(METRIC.expensesCreatedTotal);

    return this.toDetailDto(expense);
  }

  async getExpenseById(requesterId: string, expenseId: string): Promise<ExpenseDetailDto> {
    const expense = await this.repository.findExpenseById(expenseId);
    if (!expense) {
      throw new NotFoundError(APP_ERRORS.EXPENSE_NOT_FOUND, "Expense not found.");
    }

    await this.assertMemberOfGroup(requesterId, expense.groupId);

    return this.toDetailDto(expense);
  }

  /**
   * Merges the provided fields over the current expense, recomputes the splits
   * for fields that affect them, and persists the expense, its splits, and the
   * expense-updated activity event in one transaction. The currency code is
   * never editable (all expenses are in PKR).
   */
  async updateExpense(
    requesterId: string,
    expenseId: string,
    input: UpdateExpenseInput,
  ): Promise<ExpenseDetailDto> {
    const expense = await this.repository.findExpenseById(expenseId);
    if (!expense) {
      throw new NotFoundError(APP_ERRORS.EXPENSE_NOT_FOUND, "Expense not found.");
    }

    const memberIds = await this.repository.findGroupMemberIds(expense.groupId);
    if (!memberIds.includes(requesterId)) {
      throw new ForbiddenError(APP_ERRORS.NOT_GROUP_MEMBER, "You are not a member of this group.");
    }

    const nextDescription = input.description ?? expense.description;
    const nextTotal = input.amountMinorUnits !== undefined
      ? BigInt(input.amountMinorUnits)
      : expense.amountMinorUnits;
    const nextPayerId = input.payerId ?? expense.paidById;
    const nextSplitType = input.splitType ?? expense.splitType;
    const nextExpenseDate = input.expenseDate ? new Date(input.expenseDate) : expense.expenseDate;

    if (!memberIds.includes(nextPayerId)) {
      throw new ForbiddenError(
        APP_ERRORS.PAYER_NOT_GROUP_MEMBER,
        "The payer must be a member of the group.",
      );
    }

    let splits: Array<{ userId: string; amountMinorUnits: bigint }>;
    if (input.participants !== undefined) {
      splits = this.reconcileSplits(nextSplitType, nextTotal, input.participants, memberIds);
    } else if (nextSplitType === "EXACT") {
      if (sumSplitAmounts(expense.splits) !== nextTotal) {
        throw new BadRequestError(
          APP_ERRORS.SPLIT_TOTAL_MISMATCH,
          "EXACT split amounts must sum to the expense total.",
        );
      }
      splits = expense.splits.map((split) => ({
        userId: split.userId,
        amountMinorUnits: split.amountMinorUnits,
      }));
    } else {
      splits = calculateEqualSplits(
        nextTotal,
        expense.splits.map((split) => split.userId),
      );
    }

    const updated = await this.repository.updateExpenseWithSplits(
      expenseId,
      {
        paidById: nextPayerId,
        description: nextDescription,
        amountMinorUnits: nextTotal,
        splitType: nextSplitType,
        expenseDate: nextExpenseDate,
        splits,
      },
      {
        userId: requesterId,
        type: "EXPENSE_UPDATED",
        message: `updated the expense "${nextDescription}"`,
      },
    );

    metrics.increment(METRIC.expensesUpdatedTotal);

    return this.toDetailDto(updated);
  }

  async deleteExpense(requesterId: string, expenseId: string): Promise<void> {
    const expense = await this.repository.findExpenseById(expenseId);
    if (!expense) {
      throw new NotFoundError(APP_ERRORS.EXPENSE_NOT_FOUND, "Expense not found.");
    }

    await this.assertMemberOfGroup(requesterId, expense.groupId);

    await this.repository.deleteExpenseWithEvent(expenseId, {
      userId: requesterId,
      type: "EXPENSE_DELETED",
      message: `deleted the expense "${expense.description}"`,
    });

    metrics.increment(METRIC.expensesDeletedTotal);
  }

  private reconcileSplits(
    splitType: "EQUAL" | "EXACT",
    totalMinorUnits: bigint,
    participants: Array<{ userId: string; amountMinorUnits?: number }>,
    memberIds: string[],
  ): Array<{ userId: string; amountMinorUnits: bigint }> {
    const participantIds = participants.map((participant) => participant.userId);
    if (new Set(participantIds).size !== participantIds.length) {
      throw new BadRequestError(
        APP_ERRORS.DUPLICATE_SPLIT_USER,
        "A participant cannot appear more than once in the splits.",
      );
    }

    for (const participantId of participantIds) {
      if (!memberIds.includes(participantId)) {
        throw new ForbiddenError(
          APP_ERRORS.SPLIT_USER_NOT_GROUP_MEMBER,
          "Every split participant must be a member of the group.",
        );
      }
    }

    if (splitType === "EQUAL") {
      return calculateEqualSplits(totalMinorUnits, participantIds);
    }

    const missingAmount = participants.some(
      (participant) => participant.amountMinorUnits === undefined,
    );
    if (missingAmount) {
      throw new BadRequestError(
        APP_ERRORS.SPLIT_TOTAL_MISMATCH,
        "Every EXACT participant must provide an amount.",
      );
    }

    const splits = participants.map((participant) => ({
      userId: participant.userId,
      amountMinorUnits: BigInt(participant.amountMinorUnits as number),
    }));

    if (sumSplitAmounts(splits) !== totalMinorUnits) {
      throw new BadRequestError(
        APP_ERRORS.SPLIT_TOTAL_MISMATCH,
        "EXACT split amounts must sum to the expense total.",
      );
    }

    return splits;
  }

  async getGroupExpenses(requesterId: string, groupId: string): Promise<ExpenseSummaryDto[]> {
    const group = await this.repository.findGroupById(groupId);
    if (!group) {
      throw new NotFoundError(APP_ERRORS.GROUP_NOT_FOUND, "Group not found.");
    }

    await this.assertMemberOfGroup(requesterId, groupId);

    const expenses = await this.repository.findExpensesByGroupId(groupId);
    return expenses.map((expense) => this.toSummaryDto(expense));
  }

  private async assertMemberOfGroup(requesterId: string, groupId: string): Promise<void> {
    const memberIds = await this.repository.findGroupMemberIds(groupId);
    if (!memberIds.includes(requesterId)) {
      throw new ForbiddenError(APP_ERRORS.NOT_GROUP_MEMBER, "You are not a member of this group.");
    }
  }

  private toNum(value: bigint): number {
    return Number(value);
  }

  private toDetailDto(expense: ExpenseWithDetails): ExpenseDetailDto {
    return {
      id: expense.id,
      groupId: expense.groupId,
      paidById: expense.paidById,
      description: expense.description,
      amountMinorUnits: this.toNum(expense.amountMinorUnits),
      currencyCode: expense.currencyCode,
      splitType: expense.splitType,
      expenseDate: expense.expenseDate,
      payer: expense.payer,
      splits: expense.splits.map((split) => ({
        id: split.id,
        userId: split.userId,
        amountMinorUnits: this.toNum(split.amountMinorUnits),
        user: split.user,
      })),
      createdAt: expense.createdAt,
      updatedAt: expense.updatedAt,
    };
  }

  private toSummaryDto(expense: ExpenseWithSummary): ExpenseSummaryDto {
    return {
      id: expense.id,
      groupId: expense.groupId,
      paidById: expense.paidById,
      description: expense.description,
      amountMinorUnits: this.toNum(expense.amountMinorUnits),
      currencyCode: expense.currencyCode,
      splitType: expense.splitType,
      expenseDate: expense.expenseDate,
      payer: expense.payer,
      splitCount: expense.splitCount,
      createdAt: expense.createdAt,
      updatedAt: expense.updatedAt,
    };
  }
}
