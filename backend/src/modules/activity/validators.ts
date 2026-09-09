import { z } from "zod";

import { idSchema } from "../../utils/idSchema.js";

/**
 * Validates the `:id` route parameter of the group-scoped activity endpoint.
 * The group id is read from `req.params.id` because this route is mounted
 * inside the group router.
 */
export const activityGroupParamsSchema = z.object({
  id: idSchema,
});

/**
 * Validates the `page` and `limit` query parameters. Values arrive as strings
 * and are coerced to integers, defaulted when omitted, and capped so a client
 * cannot request an unbounded page of events.
 */
export const activityQuerySchema = z
  .object({
    page: z.coerce
      .number()
      .int("Page must be a whole number")
      .positive("Page must be at least 1")
      .default(1),
    limit: z.coerce
      .number()
      .int("Limit must be a whole number")
      .positive("Limit must be at least 1")
      .max(50, "Limit cannot exceed 50")
      .default(20),
  })
  .strict();

export type ActivityGroupParams = z.infer<typeof activityGroupParamsSchema>;
export type ActivityQuery = z.infer<typeof activityQuerySchema>;
