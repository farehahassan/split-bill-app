import { APP_ERRORS } from "../../constants/app-errors.js";
import { ConflictError, ForbiddenError, NotFoundError } from "../../errors/app.error.js";
import {
  GroupRepository,
  type GroupWithMemberCount,
  type GroupWithMembers,
} from "./group.repository.js";

type GroupResult = {
  id: string;
  name: string;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
};

export class GroupService {
  constructor(private repository: GroupRepository) {}

  async createGroup(userId: string, data: { name: string }): Promise<GroupResult> {
    const group = await this.repository.createGroupWithOwner(userId, data);

    return {
      id: group.id,
      name: group.name,
      createdById: group.createdById,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
    };
  }

  getUserGroups(userId: string): Promise<GroupWithMemberCount[]> {
    return this.repository.findGroupsByUserId(userId);
  }

  async getGroupById(userId: string, groupId: string): Promise<GroupWithMembers> {
    const group = await this.repository.findGroupByIdWithMembers(groupId);
    if (!group) {
      throw new NotFoundError(APP_ERRORS.GROUP_NOT_FOUND, "Group not found.");
    }

    const isMember = await this.repository.isGroupMember(groupId, userId);
    if (!isMember) {
      throw new ForbiddenError(APP_ERRORS.NOT_GROUP_MEMBER, "You are not a member of this group.");
    }

    return group;
  }

  async updateGroup(userId: string, groupId: string, data: { name: string }): Promise<GroupResult> {
    const group = await this.repository.findGroupById(groupId);
    if (!group) {
      throw new NotFoundError(APP_ERRORS.GROUP_NOT_FOUND, "Group not found.");
    }

    if (group.createdById !== userId) {
      throw new ForbiddenError(
        APP_ERRORS.NOT_GROUP_OWNER,
        "Only the group owner can update this group.",
      );
    }

    const updated = await this.repository.updateGroup(groupId, data);
    if (!updated) {
      throw new NotFoundError(APP_ERRORS.GROUP_NOT_FOUND, "Group not found.");
    }

    return {
      id: updated.id,
      name: updated.name,
      createdById: updated.createdById,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  async deleteGroup(userId: string, groupId: string): Promise<void> {
    const group = await this.repository.findGroupById(groupId);
    if (!group) {
      throw new NotFoundError(APP_ERRORS.GROUP_NOT_FOUND, "Group not found.");
    }

    if (group.createdById !== userId) {
      throw new ForbiddenError(
        APP_ERRORS.NOT_GROUP_OWNER,
        "Only the group owner can delete this group.",
      );
    }

    await this.repository.deleteGroup(groupId);
  }

  async addGroupMember(
    userId: string,
    groupId: string,
    memberId: string,
  ): Promise<{ id: string; groupId: string; userId: string; createdAt: Date }> {
    const group = await this.repository.findGroupById(groupId);
    if (!group) {
      throw new NotFoundError(APP_ERRORS.GROUP_NOT_FOUND, "Group not found.");
    }

    if (group.createdById !== userId) {
      throw new ForbiddenError(APP_ERRORS.NOT_GROUP_OWNER, "Only the group owner can add members.");
    }

    const targetUser = await this.repository.findUserById(memberId);
    if (!targetUser) {
      throw new NotFoundError(APP_ERRORS.USER_NOT_FOUND, "User not found.");
    }

    const isMember = await this.repository.isGroupMember(groupId, memberId);
    if (isMember) {
      throw new ConflictError(
        APP_ERRORS.ALREADY_GROUP_MEMBER,
        "This user is already a member of the group.",
      );
    }

    const member = await this.repository.addGroupMember(groupId, memberId);

    return {
      id: member.id,
      groupId: member.groupId,
      userId: member.userId,
      createdAt: member.createdAt,
    };
  }

  async removeGroupMember(userId: string, groupId: string, memberId: string): Promise<void> {
    const group = await this.repository.findGroupById(groupId);
    if (!group) {
      throw new NotFoundError(APP_ERRORS.GROUP_NOT_FOUND, "Group not found.");
    }

    if (group.createdById !== userId) {
      throw new ForbiddenError(
        APP_ERRORS.NOT_GROUP_OWNER,
        "Only the group owner can remove members.",
      );
    }

    if (memberId === group.createdById) {
      throw new ConflictError(
        APP_ERRORS.CANNOT_REMOVE_OWNER,
        "The group owner cannot be removed from the group.",
      );
    }

    const member = await this.repository.findGroupMember(groupId, memberId);
    if (!member) {
      throw new NotFoundError(APP_ERRORS.NOT_GROUP_MEMBER, "Member not found in this group.");
    }

    await this.repository.removeGroupMember(groupId, memberId);
  }
}
