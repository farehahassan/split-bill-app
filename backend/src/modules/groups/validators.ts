import { z } from "zod";

import { idSchema } from "../../utils/idSchema.js";

export const createGroupBodySchema = z
  .object({
    name: z.string().trim().min(1, "Group name is required").max(100, "Group name is too long"),
  })
  .strict();

export const updateGroupBodySchema = z
  .object({
    name: z.string().trim().min(1, "Group name is required").max(100, "Group name is too long"),
  })
  .strict();

export const groupParamsSchema = z.object({
  id: idSchema,
});

export const addMemberBodySchema = z
  .object({
    userId: idSchema,
  })
  .strict();

export const memberParamsSchema = z.object({
  id: idSchema,
  memberId: idSchema,
});

export type CreateGroupBody = z.infer<typeof createGroupBodySchema>;
export type UpdateGroupBody = z.infer<typeof updateGroupBodySchema>;
export type GroupParams = z.infer<typeof groupParamsSchema>;
export type AddMemberBody = z.infer<typeof addMemberBodySchema>;
export type MemberParams = z.infer<typeof memberParamsSchema>;
