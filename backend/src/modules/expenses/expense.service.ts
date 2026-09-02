import { APP_ERRORS } from "../../constants/app-errors.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../errors/app.error.js";
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

    const expense = await this.repository.createExpenseWithSplits({
      groupId,
      paidById: input.payerId,
      description: input.description,
      amountMinorUnits: totalMinorUnits,
      currencyCode: "PKR",
      splitType: input.splitType,
      expenseDate: input.expenseDate ? new Date(input.expenseDate) : new Date(),
      splits,
    });

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
