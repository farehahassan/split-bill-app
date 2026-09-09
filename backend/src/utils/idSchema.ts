import { z } from "zod";

/**
 * Validates resource/user identifiers as UUIDs. Route parameters and body id
 * fields are compared against identifiers stored by Prisma's `@default(uuid())`
 * columns, so non-UUID ids are rejected at the HTTP boundary and can never
 * reach the database layer.
 */
export const idSchema = z.string().trim().uuid("ID must be a valid UUID");