import type { Request, Response } from "express";

import { HTTP_STATUSES } from "../../constants/http-statuses.js";
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
  const expenses = await expenseService.getGroupExpenses(req.userId!, groupId);
  res.status(HTTP_STATUSES.OK).json({ success: true, data: { expenses } });
}
