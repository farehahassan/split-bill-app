import { z } from "zod";

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
  id: z.string().min(1, "Group ID is required"),
});

export const addMemberBodySchema = z
  .object({
    userId: z.string().min(1, "User ID is required"),
  })
  .strict();

export const memberParamsSchema = z.object({
  id: z.string().min(1, "Group ID is required"),
  memberId: z.string().min(1, "Member ID is required"),
});

export type CreateGroupBody = z.infer<typeof createGroupBodySchema>;
export type UpdateGroupBody = z.infer<typeof updateGroupBodySchema>;
export type GroupParams = z.infer<typeof groupParamsSchema>;
export type AddMemberBody = z.infer<typeof addMemberBodySchema>;
export type MemberParams = z.infer<typeof memberParamsSchema>;
