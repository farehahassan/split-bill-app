import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";

import { prisma } from "../../src/db/prisma.js";
import { APP_ERRORS } from "../../src/constants/app-errors.js";
import { GroupRepository } from "../../src/modules/groups/group.repository.js";
import { GroupService } from "../../src/modules/groups/group.service.js";
import { groupCacheKey } from "../../src/modules/groups/group.cache.js";
import { testRedisClient } from "./helpers/redis.js";
import { createTestUser } from "./helpers/fixtures.js";

const repository = new GroupRepository();
const service = new GroupService(repository);

describe("group persistence (PostgreSQL)", () => {
  it("creates a group with its owner membership and a GROUP_CREATED activity event", async () => {
    const owner = await createTestUser();
    const group = await service.createGroup(owner.id, { name: "Weekend Trip" });

    const persisted = await prisma.group.findUnique({ where: { id: group.id } });
    expect(persisted).not.toBeNull();
    expect(persisted!.name).toBe("Weekend Trip");
    expect(persisted!.createdById).toBe(owner.id);

    const memberships = await prisma.groupMember.findMany({ where: { groupId: group.id } });
    expect(memberships).toHaveLength(1);
    expect(memberships[0]!.userId).toBe(owner.id);

    const activity = await prisma.activityEvent.findMany({
      where: { groupId: group.id, type: "GROUP_CREATED" },
    });
    expect(activity).toHaveLength(1);

    // The cache-aside Redis entry for the new group is EMPTY until it is read.
    expect(await testRedisClient().get(groupCacheKey(group.id))).toBeNull();
  });

  it("addGroupMember records MEMBER_ADDED and duplicate adds conflict at the service layer", async () => {
    const owner = await createTestUser();
    const member = await createTestUser();
    const group = await service.createGroup(owner.id, { name: "Gym" });

    const added = await service.addGroupMember(owner.id, group.id, member.id);
    expect((await prisma.groupMember.findMany({ where: { groupId: group.id } }))).toHaveLength(2);
    expect(
      (await prisma.activityEvent.count({ where: { groupId: group.id, type: "MEMBER_ADDED" } })),
    ).toBe(1);
    expect(added.userId).toBe(member.id);

    // Second add of the same member is rejected by the service's membership check.
    await expect(service.addGroupMember(owner.id, group.id, member.id)).rejects.toMatchObject({
      code: APP_ERRORS.ALREADY_GROUP_MEMBER,
    });

    // And the database would reject a raw duplicate write as well.
    const duplicate = await repository
      .addGroupMember(group.id, member.id, {
        userId: owner.id,
        type: "MEMBER_ADDED",
        message: "duplicate",
      })
      .then(() => null)
      .catch((error: unknown) => error);
    expect(duplicate).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    expect((duplicate as Prisma.PrismaClientKnownRequestError).code).toBe("P2002");
  });

  it("non-owners cannot add or rename members", async () => {
    const owner = await createTestUser();
    const outsider = await createTestUser();
    const group = await service.createGroup(owner.id, { name: "Club" });

    await expect(service.addGroupMember(outsider.id, group.id, owner.id)).rejects.toMatchObject({
      code: APP_ERRORS.NOT_GROUP_OWNER,
    });
    await expect(service.updateGroup(outsider.id, group.id, { name: "Hacked" })).rejects.toMatchObject(
      { code: APP_ERRORS.NOT_GROUP_OWNER },
    );

    // Nothing was written.
    expect((await prisma.groupMember.findMany({ where: { groupId: group.id } }))).toHaveLength(1);
    expect((await prisma.group.findUnique({ where: { id: group.id } }))!.name).toBe("Club");
  });

  it("removeGroupMember revokes access and logs MEMBER_REMOVED; the owner cannot be removed", async () => {
    const owner = await createTestUser();
    const member = await createTestUser();
    const group = await service.createGroup(owner.id, { name: "Camp" });
    await service.addGroupMember(owner.id, group.id, member.id);

    await service.removeGroupMember(owner.id, group.id, member.id);

    expect(await repository.isGroupMember(group.id, member.id)).toBe(false);
    expect(
      (await prisma.activityEvent.count({ where: { groupId: group.id, type: "MEMBER_REMOVED" } })),
    ).toBe(1);

    await expect(service.removeGroupMember(owner.id, group.id, owner.id)).rejects.toMatchObject({
      code: APP_ERRORS.CANNOT_REMOVE_OWNER,
    });
    await expect(service.removeGroupMember(owner.id, group.id, member.id)).rejects.toMatchObject({
      code: APP_ERRORS.NOT_GROUP_MEMBER,
    });
  });

  it("rename updates the row, records GROUP_UPDATED, and invalidates the Redis cache entry", async () => {
    const owner = await createTestUser();
    const group = await service.createGroup(owner.id, { name: "Before" });

    // Simulate a cached read, then rename.
    await service.getGroupById(owner.id, group.id);
    expect(await testRedisClient().get(groupCacheKey(group.id))).not.toBeNull();

    const updated = await service.updateGroup(owner.id, group.id, { name: "After" });
    expect(updated.name).toBe("After");
    expect((await prisma.group.findUnique({ where: { id: group.id } }))!.name).toBe("After");
    expect(
      (await prisma.activityEvent.count({ where: { groupId: group.id, type: "GROUP_UPDATED" } })),
    ).toBe(1);

    // Cache entry for the renamed group is gone.
    expect(await testRedisClient().get(groupCacheKey(group.id))).toBeNull();
  });

  it("getGroupById returns members and enforces membership for cache hits", async () => {
    const owner = await createTestUser();
    const member = await createTestUser();
    const group = await service.createGroup(owner.id, { name: "Team" });
    await service.addGroupMember(owner.id, group.id, member.id);

    const firstRead = await service.getGroupById(owner.id, group.id);
    expect(firstRead.members.map((m) => m.id).sort()).toEqual([owner.id, member.id].sort());

    // Second read is a cache hit (already populated above).
    const secondRead = await service.getGroupById(owner.id, group.id);
    expect(secondRead.name).toBe("Team");

    // A non-member is still rejected even when the cache is warm.
    const outsider = await createTestUser();
    await expect(service.getGroupById(outsider.id, group.id)).rejects.toMatchObject({
      code: APP_ERRORS.NOT_GROUP_MEMBER,
    });
  });
});