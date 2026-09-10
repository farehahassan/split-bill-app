import { z } from "zod";

/**
 * Validates the `:id` parameter of the group-scoped summary routes. The group
 * id is read from `req.params.id` because this router is mounted with
 * `mergeParams` inside the group router.
 */
export const summaryGroupParamsSchema = z.object({
  id: z.string().trim().min(1, "Group ID is required"),
});

export type SummaryGroupParams = z.infer<typeof summaryGroupParamsSchema>;
