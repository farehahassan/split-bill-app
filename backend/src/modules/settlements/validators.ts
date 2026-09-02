import { z } from "zod";

const safeAmount = z
  .number()
  .int("Amount must be a whole number of minor units")
  .positive("Amount must be greater than zero")
  .safe("Amount must be a safe integer");

/**
 * Validates the `:id` route parameter of the group-scoped settlement and
 * balance endpoints. The group id is read from `req.params.id` because these
 * routes are mounted inside the group router.
 */
export const settlementGroupParamsSchema = z.object({
  id: z.string().min(1, "Group ID is required"),
});

/**
 * Validates the `:id` route parameter of the standalone settlement detail
 * endpoint, which resolves a settlement by its own id.
 */
export const settlementParamsSchema = z.object({
  id: z.string().min(1, "Settlement ID is required"),
});

export const createSettlementBodySchema = z
  .object({
    payerId: z.string().min(1, "Payer ID is required"),
    payeeId: z.string().min(1, "Payee ID is required"),
    amountMinorUnits: safeAmount,
  })
  .strict();

export type CreateSettlementBody = z.infer<typeof createSettlementBodySchema>;
export type SettlementParams = z.infer<typeof settlementParamsSchema>;
