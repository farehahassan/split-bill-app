import type { Group, GroupMember } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import {
  createActivityEvent,
  type ActivityEventInput,
} from "../activity/activity.repository.js";

export interface GroupMemberUser {
  id: string;
  name: string;
  email: string;
}

export interface GroupWithMemberCount {
  id: string;
  name: string;
  createdById: string;
  memberCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface GroupWithMembers {
  id: string;
  name: string;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
  members: GroupMemberUser[];
}

export class GroupRepository {
  /**
   * Creates a group, its owner's membership, and the group-created activity
   * event inside a single transaction so that either all three records persist
   * or none do.
   */
  async createGroupWithOwner(
    ownerId: string,
    data: { name: string },
    activity: ActivityEventInput,
  ): Promise<Group> {
    return prisma.$transaction(async (tx) => {
      const group = await tx.group.create({
        data: {
          name: data.name,
          createdById: ownerId,
        },
      });

      await tx.groupMember.create({
        data: {
          groupId: group.id,
          userId: ownerId,
        },
      });

      await createActivityEvent(tx, {
        groupId: group.id,
        userId: activity.userId,
        type: activity.type,
        message: activity.message,
        amountMinorUnits: null,
        currencyCode: null,
        occurredAt: group.createdAt,
      });

      return group;
    });
  }

  findGroupById(id: string): Promise<Group | null> {
    return prisma.group.findUnique({ where: { id } });
  }

  async findGroupByIdWithMembers(id: string): Promise<GroupWithMembers | null> {
    const group = await prisma.group.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        createdById: true,
        createdAt: true,
        updatedAt: true,
        members: {
          select: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    if (!group) {
      return null;
    }

    return {
      id: group.id,
      name: group.name,
      createdById: group.createdById,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
      members: group.members.map((m) => m.user),
    };
  }

  async findGroupsByUserId(userId: string): Promise<GroupWithMemberCount[]> {
    const groups = await prisma.group.findMany({
      where: {
        members: {
          some: {
            userId,
          },
        },
      },
      select: {
        id: true,
        name: true,
        createdById: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            members: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return groups.map((group) => ({
      id: group.id,
      name: group.name,
      createdById: group.createdById,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
      memberCount: group._count.members,
    }));
  }

  findUserById(id: string): Promise<{ id: string; name: string; email: string } | null> {
    return prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
      },
    });
  }

  isGroupMember(groupId: string, userId: string): Promise<boolean> {
    return prisma.groupMember
      .findUnique({
        where: {
          groupId_userId: {
            groupId,
            userId,
          },
        },
        select: {
          id: true,
        },
      })
      .then((member) => member !== null);
  }

  /**
   * Renames the group and records the group-updated activity event atomically.
   * Returns `null` when the group no longer exists, so the service can turn
   * that into a `GROUP_NOT_FOUND` error without leaking a Prisma failure code.
   */
  async updateGroup(
    id: string,
    data: { name: string },
    activity: ActivityEventInput,
  ): Promise<Group | null> {
    const existing = await prisma.group.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      return null;
    }

    return prisma.$transaction(async (tx) => {
      const group = await tx.group.update({
        where: { id },
        data: {
          name: data.name,
        },
      });

      await createActivityEvent(tx, {
        groupId: group.id,
        userId: activity.userId,
        type: activity.type,
        message: activity.message,
        amountMinorUnits: null,
        currencyCode: null,
        occurredAt: new Date(),
      });

      return group;
    });
  }

  async deleteGroup(id: string): Promise<void> {
    await prisma.group.delete({ where: { id } });
  }

  /**
   * Adds a group member and records the member-added activity event atomically.
   */
  async addGroupMember(
    groupId: string,
    memberId: string,
    activity: ActivityEventInput,
  ): Promise<GroupMember> {
    return prisma.$transaction(async (tx) => {
      const member = await tx.groupMember.create({
        data: {
          groupId,
          userId: memberId,
        },
      });

      await createActivityEvent(tx, {
        groupId,
        userId: activity.userId,
        type: activity.type,
        message: activity.message,
        amountMinorUnits: null,
        currencyCode: null,
        occurredAt: member.createdAt,
      });

      return member;
    });
  }

  findGroupMember(groupId: string, memberId: string): Promise<GroupMember | null> {
    return prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId,
          userId: memberId,
        },
      },
    });
  }

  /**
   * Removes a group member and records the member-removed activity event
   * atomically, so a membership can never disappear without its audit trail.
   */
  async removeGroupMember(
    groupId: string,
    memberId: string,
    activity: ActivityEventInput,
  ): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await tx.groupMember.delete({
        where: {
          groupId_userId: {
            groupId,
            userId: memberId,
          },
        },
      });

      await createActivityEvent(tx, {
        groupId,
        userId: activity.userId,
        type: activity.type,
        message: activity.message,
        amountMinorUnits: null,
        currencyCode: null,
        occurredAt: new Date(),
      });
    });
  }
}
