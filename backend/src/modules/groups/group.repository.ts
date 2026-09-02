import type { Group, GroupMember } from "@prisma/client";
import { prisma } from "../../db/prisma.js";

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
   * Creates a group and its owner's membership inside a single transaction so
   * that either both records persist or neither does.
   */
  async createGroupWithOwner(ownerId: string, data: { name: string }): Promise<Group> {
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

  async updateGroup(id: string, data: { name: string }): Promise<Group | null> {
    const existing = await prisma.group.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      return null;
    }

    return prisma.group.update({
      where: { id },
      data: {
        name: data.name,
      },
    });
  }

  async deleteGroup(id: string): Promise<void> {
    await prisma.group.delete({ where: { id } });
  }

  async addGroupMember(groupId: string, memberId: string): Promise<GroupMember> {
    return prisma.groupMember.create({
      data: {
        groupId,
        userId: memberId,
      },
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

  async removeGroupMember(groupId: string, memberId: string): Promise<void> {
    await prisma.groupMember.delete({
      where: {
        groupId_userId: {
          groupId,
          userId: memberId,
        },
      },
    });
  }
}
