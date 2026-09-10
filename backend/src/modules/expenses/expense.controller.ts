import type { Request, Response } from "express";

import { HTTP_STATUSES } from "../../constants/http-statuses.js";
import type { PaginationQuery } from "../../utils/pagination.js";
import { ExpenseService } from "./expense.service.js";
import { ExpenseRepository } from "./expense.repository.js";

const expenseService = new ExpenseService(new ExpenseRepository());

export async function createExpense(req: Request, res: Response): Promise<void> {
  const groupId = (req.params as { id: string }).id;
  const body = req.body as {
    description: string;
    amountMinorUnits: number;
    payerId: string;
    splitType: "EQUAL" | "EXACT";
    participants: Array<{ userId: string; amountMinorUnits?: number }>;
    expenseDate?: string;
  };

  const expense = await expenseService.createExpense(req.userId!, {
    groupId,
    description: body.description,
    amountMinorUnits: body.amountMinorUnits,
    payerId: body.payerId,
    splitType: body.splitType,
    participants: body.participants,
    expenseDate: body.expenseDate,
  });

  res.status(HTTP_STATUSES.CREATED).json({ success: true, data: { expense } });
}

export async function getExpenseById(req: Request, res: Response): Promise<void> {
  const expenseId = (req.params as { id: string }).id;
  const expense = await expenseService.getExpenseById(req.userId!, expenseId);
  res.status(HTTP_STATUSES.OK).json({ success: true, data: { expense } });
}

export async function getGroupExpenses(req: Request, res: Response): Promise<void> {
  const groupId = (req.params as { id: string }).id;
  const query = req.query as PaginationQuery;

  const pagination =
    query.page !== undefined || query.limit !== undefined
      ? { page: query.page ?? 1, limit: query.limit ?? 20 }
      : undefined;

  const result = await expenseService.getGroupExpenses(req.userId!, groupId, pagination);

  const payload: Record<string, unknown> = { success: true, data: { expenses: result.expenses } };
  if (result.pagination) {
    payload.pagination = result.pagination;
  }

  res.status(HTTP_STATUSES.OK).json(payload);
}
