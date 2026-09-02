import { z } from "zod";

const safeAmount = z
  .number()
  .int("Amount must be a whole number of minor units")
  .positive("Amount must be greater than zero")
  .safe("Amount must be a safe integer");

/**
 * Validates the `:id` route parameter used for both a group (when creating or
 * listing that group's expenses) and an expense (when fetching a single
 * expense). Kept local to this module so it stays self-contained.
 */
export const expenseTargetParamsSchema = z.object({
  id: z.string().min(1, "ID is required"),
});

export const createExpenseBodySchema = z
  .object({
    description: z
      .string()
      .trim()
      .min(1, "Description is required")
      .max(280, "Description is too long"),
    amountMinorUnits: safeAmount,
    payerId: z.string().min(1, "Payer ID is required"),
    splitType: z.enum(["EQUAL", "EXACT"]),
    participants: z
      .array(
        z.object({
          userId: z.string().min(1, "Participant user ID is required"),
          amountMinorUnits: safeAmount.optional(),
        }),
      )
      .min(1, "At least one participant is required"),
    expenseDate: z.string().datetime({ offset: true }).optional(),
  })
  .strict();

export const expenseParamsSchema = z.object({
  id: z.string().min(1, "Expense ID is required"),
});

export type CreateExpenseBody = z.infer<typeof createExpenseBodySchema>;
export type ExpenseParams = z.infer<typeof expenseParamsSchema>;
