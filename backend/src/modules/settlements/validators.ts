import { z } from "zod";

import { idSchema } from "../../utils/idSchema.js";

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
  id: idSchema,
});

/**
 * Validates the `:id` route parameter of the standalone settlement detail
 * endpoint, which resolves a settlement by its own id.
 */
export const settlementParamsSchema = z.object({
  id: idSchema,
});

export const createSettlementBodySchema = z
  .object({
    payerId: idSchema,
    payeeId: idSchema,
    amountMinorUnits: safeAmount,
  })
  .strict();

export type CreateSettlementBody = z.infer<typeof createSettlementBodySchema>;
export type SettlementParams = z.infer<typeof settlementParamsSchema>;
