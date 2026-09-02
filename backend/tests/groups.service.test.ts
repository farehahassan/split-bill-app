import { describe, it, expect, vi, beforeEach } from "vitest";

import { GroupService } from "../src/modules/groups/group.service.js";
import { GroupRepository } from "../src/modules/groups/group.repository.js";
import { APP_ERRORS } from "../src/constants/app-errors.js";
import { HTTP_STATUSES } from "../src/constants/http-statuses.js";

vi.mock("../src/modules/groups/group.repository.js", async () => {
  const actual = await vi.importActual<typeof import("../src/modules/groups/group.repository.js")>(
    "../src/modules/groups/group.repository.js",
  );
  return {
    ...actual,
    GroupRepository: vi.fn(() => ({
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
    })),
  };
});

const repository = vi.mocked(new GroupRepository());

function makeService(): GroupService {
  return new GroupService(repository);
}

const group = {
  id: "group-1",
  name: "Trip to Naran",
  createdById: "owner-1",
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("GroupService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createGroup", () => {
    it("should create a group with the creator as owner", async () => {
      repository.createGroupWithOwner.mockResolvedValue(group);

      const service = makeService();
      const result = await service.createGroup("owner-1", { name: "Trip to Naran" });

      expect(repository.createGroupWithOwner).toHaveBeenCalledWith("owner-1", {
        name: "Trip to Naran",
      });
      expect(result).toEqual({
        id: group.id,
        name: group.name,
        createdById: "owner-1",
        createdAt: group.createdAt,
        updatedAt: group.updatedAt,
      });
    });

    it("should create the creator as the first member via an atomic transaction", async () => {
      repository.createGroupWithOwner.mockResolvedValue(group);
      const txSpy = vi.mocked(repository.createGroupWithOwner);

      const service = makeService();
      await service.createGroup("owner-1", { name: "Trip to Naran" });

      expect(txSpy).toHaveBeenCalledTimes(1);
    });

    it("should propagate a repository failure so no partial group persists", async () => {
      repository.createGroupWithOwner.mockRejectedValue(new Error("db boom"));

      const service = makeService();
      await expect(service.createGroup("owner-1", { name: "Trip to Naran" })).rejects.toThrow(
        "db boom",
      );
    });
  });

  describe("getUserGroups", () => {
    it("should return the user's groups", async () => {
      repository.findGroupsByUserId.mockResolvedValue([{ ...group, memberCount: 5 }]);

      const service = makeService();
      const result = await service.getUserGroups("owner-1");

      expect(repository.findGroupsByUserId).toHaveBeenCalledWith("owner-1");
      expect(result).toEqual([{ ...group, memberCount: 5 }]);
    });

    it("should return an empty array when the user has no groups", async () => {
      repository.findGroupsByUserId.mockResolvedValue([]);

      const service = makeService();
      const result = await service.getUserGroups("owner-1");

      expect(result).toEqual([]);
    });
  });

  describe("getGroupById", () => {
    it("should return the group with members for a member", async () => {
      repository.findGroupByIdWithMembers.mockResolvedValue({
        ...group,
        members: [
          { id: "u1", name: "Ahmed", email: "ahmed@example.com" },
          { id: "u2", name: "Sana", email: "sana@example.com" },
        ],
      });
      repository.isGroupMember.mockResolvedValue(true);

      const service = makeService();
      const result = await service.getGroupById("owner-1", "group-1");

      expect(result).toMatchObject({
        id: "group-1",
        members: [
          { id: "u1", name: "Ahmed", email: "ahmed@example.com" },
          { id: "u2", name: "Sana", email: "sana@example.com" },
        ],
      });
    });

    it("should throw NOT_FOUND when the group does not exist", async () => {
      repository.findGroupByIdWithMembers.mockResolvedValue(null);

      const service = makeService();
      await expect(service.getGroupById("owner-1", "missing")).rejects.toMatchObject({
        code: APP_ERRORS.GROUP_NOT_FOUND,
        statusCode: HTTP_STATUSES.NOT_FOUND,
      });
    });

    it("should throw FORBIDDEN when the user is not a member", async () => {
      repository.findGroupByIdWithMembers.mockResolvedValue({ ...group, members: [] });
      repository.isGroupMember.mockResolvedValue(false);

      const service = makeService();
      await expect(service.getGroupById("outsider", "group-1")).rejects.toMatchObject({
        code: APP_ERRORS.NOT_GROUP_MEMBER,
        statusCode: HTTP_STATUSES.FORBIDDEN,
      });
    });
  });

  describe("updateGroup", () => {
    it("should allow the owner to update the group name", async () => {
      repository.findGroupById.mockResolvedValue(group);
      repository.updateGroup.mockResolvedValue({ ...group, name: "Updated Name" });

      const service = makeService();
      const result = await service.updateGroup("owner-1", "group-1", { name: "Updated Name" });

      expect(repository.updateGroup).toHaveBeenCalledWith("group-1", { name: "Updated Name" });
      expect(result).toMatchObject({ id: "group-1", name: "Updated Name" });
    });

    it("should throw FORBIDDEN when the user is not the owner", async () => {
      repository.findGroupById.mockResolvedValue(group);

      const service = makeService();
      await expect(
        service.updateGroup("non-owner", "group-1", { name: "Updated Name" }),
      ).rejects.toMatchObject({
        code: APP_ERRORS.NOT_GROUP_OWNER,
        statusCode: HTTP_STATUSES.FORBIDDEN,
      });
      expect(repository.updateGroup).not.toHaveBeenCalled();
    });

    it("should throw NOT_FOUND when the group does not exist", async () => {
      repository.findGroupById.mockResolvedValue(null);

      const service = makeService();
      await expect(
        service.updateGroup("owner-1", "missing", { name: "Updated Name" }),
      ).rejects.toMatchObject({
        code: APP_ERRORS.GROUP_NOT_FOUND,
        statusCode: HTTP_STATUSES.NOT_FOUND,
      });
    });
  });

  describe("deleteGroup", () => {
    it("should allow the owner to delete the group", async () => {
      repository.findGroupById.mockResolvedValue(group);
      repository.deleteGroup.mockResolvedValue();

      const service = makeService();
      await service.deleteGroup("owner-1", "group-1");

      expect(repository.deleteGroup).toHaveBeenCalledWith("group-1");
    });

    it("should throw FORBIDDEN when the user is not the owner", async () => {
      repository.findGroupById.mockResolvedValue(group);

      const service = makeService();
      await expect(service.deleteGroup("non-owner", "group-1")).rejects.toMatchObject({
        code: APP_ERRORS.NOT_GROUP_OWNER,
        statusCode: HTTP_STATUSES.FORBIDDEN,
      });
      expect(repository.deleteGroup).not.toHaveBeenCalled();
    });

    it("should throw NOT_FOUND when the group does not exist", async () => {
      repository.findGroupById.mockResolvedValue(null);

      const service = makeService();
      await expect(service.deleteGroup("owner-1", "missing")).rejects.toMatchObject({
        code: APP_ERRORS.GROUP_NOT_FOUND,
        statusCode: HTTP_STATUSES.NOT_FOUND,
      });
    });
  });

  describe("addGroupMember", () => {
    it("should allow the owner to add a member", async () => {
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

      const service = makeService();
      const result = await service.addGroupMember("owner-1", "group-1", "u2");

      expect(repository.addGroupMember).toHaveBeenCalledWith("group-1", "u2");
      expect(result).toMatchObject({ userId: "u2", groupId: "group-1" });
    });

    it("should throw NOT_FOUND when the target user does not exist", async () => {
      repository.findGroupById.mockResolvedValue(group);
      repository.findUserById.mockResolvedValue(null);

      const service = makeService();
      await expect(service.addGroupMember("owner-1", "group-1", "ghost")).rejects.toMatchObject({
        code: APP_ERRORS.USER_NOT_FOUND,
        statusCode: HTTP_STATUSES.NOT_FOUND,
      });
    });

    it("should throw CONFLICT when the user is already a member", async () => {
      repository.findGroupById.mockResolvedValue(group);
      repository.findUserById.mockResolvedValue({
        id: "u2",
        name: "Sana",
        email: "sana@example.com",
      });
      repository.isGroupMember.mockResolvedValue(true);

      const service = makeService();
      await expect(service.addGroupMember("owner-1", "group-1", "u2")).rejects.toMatchObject({
        code: APP_ERRORS.ALREADY_GROUP_MEMBER,
        statusCode: HTTP_STATUSES.CONFLICT,
      });
      expect(repository.addGroupMember).not.toHaveBeenCalled();
    });

    it("should throw FORBIDDEN when the requester is not the owner", async () => {
      repository.findGroupById.mockResolvedValue(group);

      const service = makeService();
      await expect(service.addGroupMember("non-owner", "group-1", "u2")).rejects.toMatchObject({
        code: APP_ERRORS.NOT_GROUP_OWNER,
        statusCode: HTTP_STATUSES.FORBIDDEN,
      });
    });
  });

  describe("removeGroupMember", () => {
    it("should allow the owner to remove a member", async () => {
      repository.findGroupById.mockResolvedValue(group);
      repository.findGroupMember.mockResolvedValue({
        id: "membership-1",
        groupId: "group-1",
        userId: "u2",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      repository.removeGroupMember.mockResolvedValue();

      const service = makeService();
      await service.removeGroupMember("owner-1", "group-1", "u2");

      expect(repository.removeGroupMember).toHaveBeenCalledWith("group-1", "u2");
    });

    it("should throw FORBIDDEN when the requester is not the owner", async () => {
      repository.findGroupById.mockResolvedValue(group);

      const service = makeService();
      await expect(service.removeGroupMember("non-owner", "group-1", "u2")).rejects.toMatchObject({
        code: APP_ERRORS.NOT_GROUP_OWNER,
        statusCode: HTTP_STATUSES.FORBIDDEN,
      });
    });

    it("should throw NOT_FOUND when the member does not exist in the group", async () => {
      repository.findGroupById.mockResolvedValue(group);
      repository.findGroupMember.mockResolvedValue(null);

      const service = makeService();
      await expect(service.removeGroupMember("owner-1", "group-1", "ghost")).rejects.toMatchObject({
        code: APP_ERRORS.NOT_GROUP_MEMBER,
        statusCode: HTTP_STATUSES.NOT_FOUND,
      });
    });

    it("should throw CONFLICT when trying to remove the owner", async () => {
      repository.findGroupById.mockResolvedValue(group);

      const service = makeService();
      await expect(
        service.removeGroupMember("owner-1", "group-1", "owner-1"),
      ).rejects.toMatchObject({
        code: APP_ERRORS.CANNOT_REMOVE_OWNER,
        statusCode: HTTP_STATUSES.CONFLICT,
      });
      expect(repository.findGroupMember).not.toHaveBeenCalled();
    });
  });
});
