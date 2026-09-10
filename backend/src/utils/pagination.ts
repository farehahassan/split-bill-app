import { z } from "zod";

/**
 * Validates the optional `page` and `limit` query parameters accepted by list
 * endpoints. Unlike the activity feed (which paginates on every request), the
 * group expense and settlement lists only apply pagination when the client
 * explicitly supplies at least one of these parameters; passing neither keeps
 * the legacy "return everything" behavior. The schema therefore has no
 * `.default()`s and no `.strict()`: extra unknown query parameters are ignored
 * exactly as they were before validation existed.
 *
 * Values arrive as strings and are coerced to integers, validated, and capped
 * so a client cannot request an unbounded page.
 */
export const paginationQuerySchema = z
  .object({
    page: z.coerce.number().int("Page must be a whole number").positive("Page must be at least 1"),
    limit: z.coerce
      .number()
      .int("Limit must be a whole number")
      .positive("Limit must be at least 1")
      .max(50, "Limit cannot exceed 50"),
  })
  .partial();

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export interface Paginated<T> {
  items: T[];
  total: number;
}
