import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

import { createApp } from "../src/app.js";
import { HTTP_STATUSES } from "../src/constants/http-statuses.js";

const JWT_SECRET = "test-secret-that-is-long-enough-for-tests";

function signToken(userId: string): string {
  return jwt.sign({ sub: userId, email: "me@example.com" }, JWT_SECRET, { expiresIn: "1h" });
}

const { cacheInstances } = vi.hoisted(() => ({
  cacheInstances: [] as Array<{
    getCachedGroupById: ReturnType<typeof vi.fn>;
    setCachedGroupById: ReturnType<typeof vi.fn>;
    invalidateGroupCache: ReturnType<typeof vi.fn>;
  }>,
}));

vi.mock("../src/modules/groups/group.cache.js", () => {
  class FakeGroupCache {
    getCachedGroupById = vi.fn(async () => null);
    setCachedGroupById = vi.fn(async () => {});
    invalidateGroupCache = vi.fn(async () => {});
    constructor() {
      cacheInstances.push(this);
    }
  }
  return { GroupCache: FakeGroupCache };
});

vi.mock("../src/db/prisma.js", async () => {
  return {
    prisma: {
      $transaction: vi.fn(),
      group: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      groupMember: {
        findUnique: vi.fn(),
        create: vi.fn(),
        delete: vi.fn(),
      },
      user: {
        findUnique: vi.fn(),
      },
    },
  };
});

import { prisma } from "../src/db/prisma.js";

const mockPrisma = vi.mocked(prisma);

const ownerId = "owner-1";
const memberId = "member-1";
const outsiderId = "outsider-1";

const group = {
  id: "group-1",
  name: "Trip to Naran",
  createdById: ownerId,
  createdAt: new Date("2026-01-01T10:00:00.000Z"),
  updatedAt: new Date("2026-01-02T10:00:00.000Z"),
};

const groupWithMembers = {
  ...group,
  members: [
    { id: ownerId, name: "Ahmed", email: "ahmed@example.com" },
    { id: memberId, name: "Sana", email: "sana@example.com" },
  ],
};

const groupMemberRow = {
  id: "membership-1",
  groupId: group.id,
  userId: memberId,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("Group caching API", () => {
  let app: ReturnType<typeof createApp>;
  const fakeCache = cacheInstances[0];

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$transaction.mockReset();
    mockPrisma.group.findUnique.mockReset();
    mockPrisma.group.findMany.mockReset();
    mockPrisma.group.create.mockReset();
    mockPrisma.group.update.mockReset();
    mockPrisma.group.delete.mockReset();
    mockPrisma.groupMember.findUnique.mockReset();
    mockPrisma.groupMember.create.mockReset();
    mockPrisma.groupMember.delete.mockReset();
    mockPrisma.user.findUnique.mockReset();
    fakeCache.getCachedGroupById.mockReset();
    fakeCache.setCachedGroupById.mockReset();
    fakeCache.invalidateGroupCache.mockReset();
    fakeCache.getCachedGroupById.mockResolvedValue(null);
    app = createApp();
  });

  describe("GET /api/v1/groups/:id", () => {
    it("returns the group and populates the cache on a miss", async () => {
      mockPrisma.group.findUnique.mockResolvedValueOnce({
        ...group,
        members: [
          { user: { id: ownerId, name: "Ahmed", email: "ahmed@example.com" } },
          { user: { id: memberId, name: "Sana", email: "sana@example.com" } },
        ],
      });
      mockPrisma.groupMember.findUnique.mockResolvedValue(groupMemberRow);

      const res = await request(app)
        .get("/api/v1/groups/group-1")
        .set("Authorization", `Bearer ${signToken(ownerId)}`);

      expect(res.status).toBe(HTTP_STATUSES.OK);
      expect(res.body.success).toBe(true);
      expect(res.body.data.group.members).toHaveLength(2);
      expect(mockPrisma.group.findUnique).toHaveBeenCalledTimes(1);
      expect(fakeCache.setCachedGroupById).toHaveBeenCalledWith(
        "group-1",
        expect.objectContaining({ id: "group-1", name: "Trip to Naran" }),
      );
    });

    it("serves a cache hit without querying the database for the group", async () => {
      fakeCache.getCachedGroupById.mockResolvedValueOnce(groupWithMembers);
      mockPrisma.groupMember.findUnique.mockResolvedValue(groupMemberRow);

      const res = await request(app)
        .get("/api/v1/groups/group-1")
        .set("Authorization", `Bearer ${signToken(ownerId)}`);

      expect(res.status).toBe(HTTP_STATUSES.OK);
      expect(res.body.success).toBe(true);
      expect(res.body.data.group.members).toHaveLength(2);
      expect(mockPrisma.group.findUnique).not.toHaveBeenCalled();
    });

    it("returns 403 on a cache hit when the requester is not a member", async () => {
      fakeCache.getCachedGroupById.mockResolvedValueOnce(groupWithMembers);
      mockPrisma.groupMember.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .get("/api/v1/groups/group-1")
        .set("Authorization", `Bearer ${signToken(outsiderId)}`);

      expect(res.status).toBe(HTTP_STATUSES.FORBIDDEN);
      expect(mockPrisma.group.findUnique).not.toHaveBeenCalled();
    });

    it("returns 403 on a miss for a non-member and does not cache the group", async () => {
      mockPrisma.group.findUnique.mockResolvedValueOnce({
        ...group,
        members: [],
      });
      mockPrisma.groupMember.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .get("/api/v1/groups/group-1")
        .set("Authorization", `Bearer ${signToken(outsiderId)}`);

      expect(res.status).toBe(HTTP_STATUSES.FORBIDDEN);
      expect(fakeCache.setCachedGroupById).not.toHaveBeenCalled();
    });

    it("returns 404 on a miss when the group does not exist", async () => {
      mockPrisma.group.findUnique.mockResolvedValueOnce(null);

      const res = await request(app)
        .get("/api/v1/groups/missing")
        .set("Authorization", `Bearer ${signToken(ownerId)}`);

      expect(res.status).toBe(HTTP_STATUSES.NOT_FOUND);
      expect(fakeCache.setCachedGroupById).not.toHaveBeenCalled();
    });

    it("returns 401 without authentication and never consults the cache", async () => {
      const res = await request(app).get("/api/v1/groups/group-1");

      expect(res.status).toBe(HTTP_STATUSES.UNAUTHORIZED);
      expect(fakeCache.getCachedGroupById).not.toHaveBeenCalled();
    });
  });

  describe("write operations invalidate the group cache", () => {
    it("invalidates after a successful rename", async () => {
      mockPrisma.group.findUnique
        .mockResolvedValueOnce(group)
        .mockResolvedValueOnce({ id: group.id });
      mockPrisma.$transaction.mockImplementation(async (fn) => {
        const tx = {
          group: { update: vi.fn().mockResolvedValue({ ...group, name: "Updated Name" }) },
          activityEvent: { create: vi.fn().mockResolvedValue({ id: "event-1" }) },
        };
        return fn(tx);
      });

      const res = await request(app)
        .put("/api/v1/groups/group-1")
        .set("Authorization", `Bearer ${signToken(ownerId)}`)
        .send({ name: "Updated Name" });

      expect(res.status).toBe(HTTP_STATUSES.OK);
      expect(res.body.data.group.name).toBe("Updated Name");
      expect(fakeCache.invalidateGroupCache).toHaveBeenCalledWith("group-1");
    });

    it("invalidates after adding a member", async () => {
      mockPrisma.group.findUnique
        .mockResolvedValueOnce(group)
        .mockResolvedValueOnce({ id: group.id, createdById: ownerId });
      mockPrisma.user.findUnique.mockResolvedValue({
        id: memberId,
        name: "Sana",
        email: "sana@example.com",
      });
      mockPrisma.groupMember.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
      mockPrisma.$transaction.mockImplementation(async (fn) => {
        const tx = {
          groupMember: { create: vi.fn().mockResolvedValue(groupMemberRow) },
          activityEvent: { create: vi.fn().mockResolvedValue({ id: "event-1" }) },
        };
        return fn(tx);
      });

      const res = await request(app)
        .post("/api/v1/groups/group-1/members")
        .set("Authorization", `Bearer ${signToken(ownerId)}`)
        .send({ userId: memberId });

      expect(res.status).toBe(HTTP_STATUSES.CREATED);
      expect(fakeCache.invalidateGroupCache).toHaveBeenCalledWith("group-1");
    });

    it("invalidates after deleting the group", async () => {
      mockPrisma.group.findUnique.mockResolvedValueOnce(group);
      mockPrisma.group.delete.mockResolvedValue(group);

      const res = await request(app)
        .delete("/api/v1/groups/group-1")
        .set("Authorization", `Bearer ${signToken(ownerId)}`);

      expect(res.status).toBe(HTTP_STATUSES.NO_CONTENT);
      expect(fakeCache.invalidateGroupCache).toHaveBeenCalledWith("group-1");
    });

    it("invalidates after removing a member", async () => {
      mockPrisma.group.findUnique
        .mockResolvedValueOnce(group)
        .mockResolvedValueOnce({ id: group.id, createdById: ownerId });
      mockPrisma.groupMember.findUnique.mockResolvedValue(groupMemberRow);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: memberId,
        name: "Sana",
        email: "sana@example.com",
      });
      mockPrisma.$transaction.mockImplementation(async (fn) => {
        const tx = {
          groupMember: { delete: vi.fn().mockResolvedValue(groupMemberRow) },
          activityEvent: { create: vi.fn().mockResolvedValue({ id: "event-1" }) },
        };
        return fn(tx);
      });

      const res = await request(app)
        .delete(`/api/v1/groups/group-1/members/${memberId}`)
        .set("Authorization", `Bearer ${signToken(ownerId)}`);

      expect(res.status).toBe(HTTP_STATUSES.NO_CONTENT);
      expect(fakeCache.invalidateGroupCache).toHaveBeenCalledWith("group-1");
    });
  });
});