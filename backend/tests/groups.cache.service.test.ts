import { describe, it, expect, vi, beforeEach } from "vitest";

import { GroupService } from "../src/modules/groups/group.service.js";
import { GroupRepository } from "../src/modules/groups/group.repository.js";
import { GroupCache } from "../src/modules/groups/group.cache.js";
import { APP_ERRORS } from "../src/constants/app-errors.js";
import { HTTP_STATUSES } from "../src/constants/http-statuses.js";

vi.mock("../src/modules/groups/group.repository.js", async () => {
  const actual = await vi.importActual<typeof import("../src/modules/groups/group.repository.js")>(
    "../src/modules/groups/group.repository.js",
  );
  return {
    ...actual,
    GroupRepository: vi.fn(function () {
      return {
        createGroupWithOwner: vi.fn(),
        findGroupsByUserId: vi.fn(),
        findGroupById: vi.fn(),
        findGroupByIdWithMembers: vi.fn(),
        findUserById: vi.fn(),
        isGroupMember: vi.fn(),
        updateGroup: vi.fn(),
        deleteGroup: vi.fn(),
        addGroupMember: vi.fn(),
        findGroupMember: vi.fn(),
        removeGroupMember: vi.fn(),
      };
    }),
  };
});

const repository = vi.mocked(new GroupRepository());

function makeCache(): GroupCache {
  return {
    getCachedGroupById: vi.fn(async () => null),
    setCachedGroupById: vi.fn(async () => {}),
    invalidateGroupCache: vi.fn(async () => {}),
  } as unknown as GroupCache;
}

const group = {
  id: "group-1",
  name: "Trip to Naran",
  createdById: "owner-1",
  createdAt: new Date("2026-01-01T10:00:00.000Z"),
  updatedAt: new Date("2026-01-02T10:00:00.000Z"),
};

const groupWithMembers = {
  ...group,
  members: [
    { id: "owner-1", name: "Ahmed", email: "ahmed@example.com" },
    { id: "u2", name: "Sana", email: "sana@example.com" },
  ],
};

describe("GroupService caching", () => {
  let cache: GroupCache;

  beforeEach(() => {
    vi.clearAllMocks();
    cache = makeCache();
  });

  describe("getGroupById (cache-aside)", () => {
    it("populates the cache on a miss and applies the membership check", async () => {
      vi.mocked(cache.getCachedGroupById).mockResolvedValueOnce(null);
      repository.findGroupByIdWithMembers.mockResolvedValue(groupWithMembers);
      repository.isGroupMember.mockResolvedValue(true);

      const service = new GroupService(repository, cache);
      const result = await service.getGroupById("owner-1", "group-1");

      expect(repository.findGroupByIdWithMembers).toHaveBeenCalledTimes(1);
      expect(cache.setCachedGroupById).toHaveBeenCalledWith("group-1", groupWithMembers);
      expect(repository.isGroupMember).toHaveBeenCalledWith("group-1", "owner-1");
      expect(result).toMatchObject({ id: "group-1" });
    });

    it("serves a cache hit without querying the database for the group", async () => {
      vi.mocked(cache.getCachedGroupById).mockResolvedValueOnce(groupWithMembers);
      repository.isGroupMember.mockResolvedValue(true);

      const service = new GroupService(repository, cache);
      const result = await service.getGroupById("owner-1", "group-1");

      expect(repository.findGroupByIdWithMembers).not.toHaveBeenCalled();
      expect(cache.setCachedGroupById).not.toHaveBeenCalled();
      expect(result).toEqual(groupWithMembers);
    });

    it("never lets a cache hit bypass membership authorization", async () => {
      vi.mocked(cache.getCachedGroupById).mockResolvedValueOnce(groupWithMembers);
      repository.isGroupMember.mockResolvedValue(false);

      const service = new GroupService(repository, cache);

      await expect(service.getGroupById("outsider", "group-1")).rejects.toMatchObject({
        code: APP_ERRORS.NOT_GROUP_MEMBER,
        statusCode: HTTP_STATUSES.FORBIDDEN,
      });
      expect(repository.findGroupByIdWithMembers).not.toHaveBeenCalled();
    });

    it("does not populate the cache for a non-member on a miss", async () => {
      vi.mocked(cache.getCachedGroupById).mockResolvedValueOnce(null);
      repository.findGroupByIdWithMembers.mockResolvedValue(groupWithMembers);
      repository.isGroupMember.mockResolvedValue(false);

      const service = new GroupService(repository, cache);

      await expect(service.getGroupById("outsider", "group-1")).rejects.toMatchObject({
        code: APP_ERRORS.NOT_GROUP_MEMBER,
        statusCode: HTTP_STATUSES.FORBIDDEN,
      });
      expect(cache.setCachedGroupById).not.toHaveBeenCalled();
    });

    it("throws NOT_FOUND on a miss when the group does not exist", async () => {
      vi.mocked(cache.getCachedGroupById).mockResolvedValueOnce(null);
      repository.findGroupByIdWithMembers.mockResolvedValue(null);

      const service = new GroupService(repository, cache);

      await expect(service.getGroupById("owner-1", "missing")).rejects.toMatchObject({
        code: APP_ERRORS.GROUP_NOT_FOUND,
        statusCode: HTTP_STATUSES.NOT_FOUND,
      });
      expect(cache.setCachedGroupById).not.toHaveBeenCalled();
    });
  });

  describe("invalidation on writes", () => {
    it("invalidates the group cache after a successful rename", async () => {
      repository.findGroupById.mockResolvedValue(group);
      repository.updateGroup.mockResolvedValue({ ...group, name: "Updated Name" });

      const service = new GroupService(repository, cache);
      await service.updateGroup("owner-1", "group-1", { name: "Updated Name" });

      expect(cache.invalidateGroupCache).toHaveBeenCalledWith("group-1");
      expect(cache.invalidateGroupCache).toHaveBeenCalledTimes(1);
    });

    it("does not invalidate the cache when the rename fails", async () => {
      repository.findGroupById.mockResolvedValue(group);
      repository.updateGroup.mockResolvedValue(null);

      const service = new GroupService(repository, cache);
      await expect(
        service.updateGroup("owner-1", "group-1", { name: "Updated Name" }),
      ).rejects.toMatchObject({ code: APP_ERRORS.GROUP_NOT_FOUND });

      expect(cache.invalidateGroupCache).not.toHaveBeenCalled();
    });

    it("invalidates the group cache after a successful delete", async () => {
      repository.findGroupById.mockResolvedValue(group);
      repository.deleteGroup.mockResolvedValue();

      const service = new GroupService(repository, cache);
      await service.deleteGroup("owner-1", "group-1");

      expect(cache.invalidateGroupCache).toHaveBeenCalledWith("group-1");
    });

    it("invalidates the group cache after adding a member", async () => {
      repository.findGroupById.mockResolvedValue(group);
      repository.findUserById.mockResolvedValue({
        id: "u2",
        name: "Sana",
        email: "sana@example.com",
      });
      repository.isGroupMember.mockResolvedValue(false);
      repository.addGroupMember.mockResolvedValue({
        id: "membership-1",
        groupId: "group-1",
        userId: "u2",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const service = new GroupService(repository, cache);
      await service.addGroupMember("owner-1", "group-1", "u2");

      expect(cache.invalidateGroupCache).toHaveBeenCalledWith("group-1");
    });

    it("invalidates the group cache after removing a member", async () => {
      repository.findGroupById.mockResolvedValue(group);
      repository.findGroupMember.mockResolvedValue({
        id: "membership-1",
        groupId: "group-1",
        userId: "u2",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      repository.removeGroupMember.mockResolvedValue();

      const service = new GroupService(repository, cache);
      await service.removeGroupMember("owner-1", "group-1", "u2");

      expect(cache.invalidateGroupCache).toHaveBeenCalledWith("group-1");
    });
  });
});
