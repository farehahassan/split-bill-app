import { z } from "zod";

import { idSchema } from "../../utils/idSchema.js";

/**
 * Validates the `:id` parameter of the group-scoped summary routes. The group
 * id is read from `req.params.id` because this router is mounted with
 * `mergeParams` inside the group router.
 */
export const summaryGroupParamsSchema = z.object({
  id: idSchema,
});

export type SummaryGroupParams = z.infer<typeof summaryGroupParamsSchema>;