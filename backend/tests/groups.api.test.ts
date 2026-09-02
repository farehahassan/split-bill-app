import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

import { createApp } from "../src/app.js";
import { HTTP_STATUSES } from "../src/constants/http-statuses.js";

const JWT_SECRET = "test-secret-that-is-long-enough-for-tests";

function signToken(userId: string): string {
  return jwt.sign({ sub: userId, email: "me@example.com" }, JWT_SECRET, { expiresIn: "1h" });
}

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
  createdAt: new Date(),
  updatedAt: new Date(),
};

const groupMember = {
  id: "membership-1",
  groupId: group.id,
  userId: memberId,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("Groups API", () => {
  let app: ReturnType<typeof createApp>;

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
    app = createApp();
  });

  describe("POST /api/v1/groups", () => {
    it("should create a group and return 201", async () => {
      mockPrisma.$transaction.mockImplementation(async (fn) => {
        const tx = {
          group: { create: vi.fn().mockResolvedValue(group) },
          groupMember: { create: vi.fn().mockResolvedValue(groupMember) },
        };
        return fn(tx);
      });

      const res = await request(app)
        .post("/api/v1/groups")
        .set("Authorization", `Bearer ${signToken(ownerId)}`)
        .send({ name: "Trip to Naran" });

      expect(res.status).toBe(HTTP_STATUSES.CREATED);
      expect(res.body.success).toBe(true);
      expect(res.body.data.group.id).toBe("group-1");
      expect(res.body.data.group.createdById).toBe(ownerId);
    });

    it("should return 400 when validation fails", async () => {
      const res = await request(app)
        .post("/api/v1/groups")
        .set("Authorization", `Bearer ${signToken(ownerId)}`)
        .send({ name: "   " });

      expect(res.status).toBe(HTTP_STATUSES.BAD_REQUEST);
      expect(res.body.success).toBe(false);
      expect(res.body.errors).toBeDefined();
    });

    it("should return 401 without authentication", async () => {
      const res = await request(app).post("/api/v1/groups").send({ name: "Trip to Naran" });

      expect(res.status).toBe(HTTP_STATUSES.UNAUTHORIZED);
    });
  });

  describe("GET /api/v1/groups", () => {
    it("should return 200 with the user's groups", async () => {
      mockPrisma.group.findMany.mockResolvedValue([
        {
          id: group.id,
          name: group.name,
          createdById: group.createdById,
          createdAt: group.createdAt,
          updatedAt: group.updatedAt,
          _count: { members: 5 },
        },
      ]);

      const res = await request(app)
        .get("/api/v1/groups")
        .set("Authorization", `Bearer ${signToken(ownerId)}`);

      expect(res.status).toBe(HTTP_STATUSES.OK);
      expect(res.body.success).toBe(true);
      expect(res.body.data.groups[0].memberCount).toBe(5);
    });

    it("should return an empty array for a user with no groups", async () => {
      mockPrisma.group.findMany.mockResolvedValue([]);

      const res = await request(app)
        .get("/api/v1/groups")
        .set("Authorization", `Bearer ${signToken(ownerId)}`);

      expect(res.status).toBe(HTTP_STATUSES.OK);
      expect(res.body.data.groups).toEqual([]);
    });

    it("should return 401 without authentication", async () => {
      const res = await request(app).get("/api/v1/groups");

      expect(res.status).toBe(HTTP_STATUSES.UNAUTHORIZED);
    });
  });

  describe("GET /api/v1/groups/:id", () => {
    it("should return 200 with group details for a member", async () => {
      mockPrisma.group.findUnique.mockResolvedValueOnce({
        id: group.id,
        name: group.name,
        createdById: group.createdById,
        createdAt: group.createdAt,
        updatedAt: group.updatedAt,
        members: [
          { user: { id: ownerId, name: "Ahmed", email: "ahmed@example.com" } },
          { user: { id: memberId, name: "Sana", email: "sana@example.com" } },
        ],
      });
      mockPrisma.groupMember.findUnique.mockResolvedValue(groupMember);

      const res = await request(app)
        .get("/api/v1/groups/group-1")
        .set("Authorization", `Bearer ${signToken(ownerId)}`);

      expect(res.status).toBe(HTTP_STATUSES.OK);
      expect(res.body.success).toBe(true);
      expect(res.body.data.group.members).toHaveLength(2);
    });

    it("should return 401 without authentication", async () => {
      const res = await request(app).get("/api/v1/groups/group-1");

      expect(res.status).toBe(HTTP_STATUSES.UNAUTHORIZED);
    });

    it("should return 403 for a non-member", async () => {
      mockPrisma.group.findUnique.mockResolvedValueOnce({
        id: group.id,
        name: group.name,
        createdById: group.createdById,
        createdAt: group.createdAt,
        updatedAt: group.updatedAt,
        members: [],
      });
      mockPrisma.groupMember.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .get("/api/v1/groups/group-1")
        .set("Authorization", `Bearer ${signToken(outsiderId)}`);

      expect(res.status).toBe(HTTP_STATUSES.FORBIDDEN);
    });

    it("should return 404 when the group does not exist", async () => {
      mockPrisma.group.findUnique.mockResolvedValueOnce(null);

      const res = await request(app)
        .get("/api/v1/groups/missing")
        .set("Authorization", `Bearer ${signToken(ownerId)}`);

      expect(res.status).toBe(HTTP_STATUSES.NOT_FOUND);
    });
  });

  describe("PUT /api/v1/groups/:id", () => {
    it("should return 200 when the owner updates the group name", async () => {
      mockPrisma.group.findUnique
        .mockResolvedValueOnce(group)
        .mockResolvedValueOnce({ id: group.id });
      mockPrisma.group.update.mockResolvedValue({ ...group, name: "Updated Name" });

      const res = await request(app)
        .put("/api/v1/groups/group-1")
        .set("Authorization", `Bearer ${signToken(ownerId)}`)
        .send({ name: "Updated Name" });

      expect(res.status).toBe(HTTP_STATUSES.OK);
      expect(res.body.success).toBe(true);
      expect(res.body.data.group.name).toBe("Updated Name");
    });

    it("should return 400 when validation fails", async () => {
      const res = await request(app)
        .put("/api/v1/groups/group-1")
        .set("Authorization", `Bearer ${signToken(ownerId)}`)
        .send({ name: "" });

      expect(res.status).toBe(HTTP_STATUSES.BAD_REQUEST);
    });

    it("should return 401 without authentication", async () => {
      const res = await request(app).put("/api/v1/groups/group-1").send({ name: "Updated" });

      expect(res.status).toBe(HTTP_STATUSES.UNAUTHORIZED);
    });

    it("should return 403 for a non-owner", async () => {
      mockPrisma.group.findUnique.mockResolvedValueOnce(group);

      const res = await request(app)
        .put("/api/v1/groups/group-1")
        .set("Authorization", `Bearer ${signToken(memberId)}`)
        .send({ name: "Updated Name" });

      expect(res.status).toBe(HTTP_STATUSES.FORBIDDEN);
    });

    it("should return 404 when the group does not exist", async () => {
      mockPrisma.group.findUnique.mockResolvedValueOnce(null);

      const res = await request(app)
        .put("/api/v1/groups/missing")
        .set("Authorization", `Bearer ${signToken(ownerId)}`)
        .send({ name: "Updated Name" });

      expect(res.status).toBe(HTTP_STATUSES.NOT_FOUND);
    });
  });

  describe("DELETE /api/v1/groups/:id", () => {
    it("should return 204 when the owner deletes the group", async () => {
      mockPrisma.group.findUnique.mockResolvedValueOnce(group);
      mockPrisma.group.delete.mockResolvedValue(group);

      const res = await request(app)
        .delete("/api/v1/groups/group-1")
        .set("Authorization", `Bearer ${signToken(ownerId)}`);

      expect(res.status).toBe(HTTP_STATUSES.NO_CONTENT);
      expect(res.body).toEqual({});
    });

    it("should return 401 without authentication", async () => {
      const res = await request(app).delete("/api/v1/groups/group-1");

      expect(res.status).toBe(HTTP_STATUSES.UNAUTHORIZED);
    });

    it("should return 403 for a non-owner", async () => {
      mockPrisma.group.findUnique.mockResolvedValueOnce(group);

      const res = await request(app)
        .delete("/api/v1/groups/group-1")
        .set("Authorization", `Bearer ${signToken(memberId)}`);

      expect(res.status).toBe(HTTP_STATUSES.FORBIDDEN);
    });

    it("should return 404 when the group does not exist", async () => {
      mockPrisma.group.findUnique.mockResolvedValueOnce(null);

      const res = await request(app)
        .delete("/api/v1/groups/missing")
        .set("Authorization", `Bearer ${signToken(ownerId)}`);

      expect(res.status).toBe(HTTP_STATUSES.NOT_FOUND);
    });
  });

  describe("POST /api/v1/groups/:id/members", () => {
    it("should return 201 when the owner adds a member", async () => {
      mockPrisma.group.findUnique
        .mockResolvedValueOnce(group)
        .mockResolvedValueOnce({ id: group.id, createdById: ownerId });
      mockPrisma.user.findUnique.mockResolvedValue({
        id: memberId,
        name: "Sana",
        email: "sana@example.com",
      });
      mockPrisma.groupMember.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
      mockPrisma.groupMember.create.mockResolvedValue(groupMember);

      const res = await request(app)
        .post("/api/v1/groups/group-1/members")
        .set("Authorization", `Bearer ${signToken(ownerId)}`)
        .send({ userId: memberId });

      expect(res.status).toBe(HTTP_STATUSES.CREATED);
      expect(res.body.success).toBe(true);
      expect(res.body.data.member.userId).toBe(memberId);
    });

    it("should return 401 without authentication", async () => {
      const res = await request(app)
        .post("/api/v1/groups/group-1/members")
        .send({ userId: memberId });

      expect(res.status).toBe(HTTP_STATUSES.UNAUTHORIZED);
    });

    it("should return 403 for a non-owner", async () => {
      mockPrisma.group.findUnique.mockResolvedValueOnce(group);

      const res = await request(app)
        .post("/api/v1/groups/group-1/members")
        .set("Authorization", `Bearer ${signToken(memberId)}`)
        .send({ userId: memberId });

      expect(res.status).toBe(HTTP_STATUSES.FORBIDDEN);
    });

    it("should return 404 when the group does not exist", async () => {
      mockPrisma.group.findUnique.mockResolvedValueOnce(null);

      const res = await request(app)
        .post("/api/v1/groups/missing/members")
        .set("Authorization", `Bearer ${signToken(ownerId)}`)
        .send({ userId: memberId });

      expect(res.status).toBe(HTTP_STATUSES.NOT_FOUND);
    });

    it("should return 404 when the target user does not exist", async () => {
      mockPrisma.group.findUnique
        .mockResolvedValueOnce(group)
        .mockResolvedValueOnce({ id: group.id, createdById: ownerId });
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .post("/api/v1/groups/group-1/members")
        .set("Authorization", `Bearer ${signToken(ownerId)}`)
        .send({ userId: "ghost" });

      expect(res.status).toBe(HTTP_STATUSES.NOT_FOUND);
    });

    it("should return 409 when the user is already a member", async () => {
      mockPrisma.group.findUnique
        .mockResolvedValueOnce(group)
        .mockResolvedValueOnce({ id: group.id, createdById: ownerId });
      mockPrisma.user.findUnique.mockResolvedValue({
        id: memberId,
        name: "Sana",
        email: "sana@example.com",
      });
      mockPrisma.groupMember.findUnique.mockResolvedValue(groupMember);

      const res = await request(app)
        .post("/api/v1/groups/group-1/members")
        .set("Authorization", `Bearer ${signToken(ownerId)}`)
        .send({ userId: memberId });

      expect(res.status).toBe(HTTP_STATUSES.CONFLICT);
    });
  });

  describe("DELETE /api/v1/groups/:id/members/:memberId", () => {
    it("should return 204 when the owner removes a member", async () => {
      mockPrisma.group.findUnique
        .mockResolvedValueOnce(group)
        .mockResolvedValueOnce({ id: group.id, createdById: ownerId });
      mockPrisma.groupMember.findUnique.mockResolvedValue(groupMember);
      mockPrisma.groupMember.delete.mockResolvedValue(groupMember);

      const res = await request(app)
        .delete(`/api/v1/groups/group-1/members/${memberId}`)
        .set("Authorization", `Bearer ${signToken(ownerId)}`);

      expect(res.status).toBe(HTTP_STATUSES.NO_CONTENT);
      expect(res.body).toEqual({});
    });

    it("should return 401 without authentication", async () => {
      const res = await request(app).delete(`/api/v1/groups/group-1/members/${memberId}`);

      expect(res.status).toBe(HTTP_STATUSES.UNAUTHORIZED);
    });

    it("should return 403 for a non-owner", async () => {
      mockPrisma.group.findUnique.mockResolvedValueOnce(group);

      const res = await request(app)
        .delete(`/api/v1/groups/group-1/members/${memberId}`)
        .set("Authorization", `Bearer ${signToken(outsiderId)}`);

      expect(res.status).toBe(HTTP_STATUSES.FORBIDDEN);
    });

    it("should return 404 when the group does not exist", async () => {
      mockPrisma.group.findUnique.mockResolvedValueOnce(null);

      const res = await request(app)
        .delete(`/api/v1/groups/missing/members/${memberId}`)
        .set("Authorization", `Bearer ${signToken(ownerId)}`);

      expect(res.status).toBe(HTTP_STATUSES.NOT_FOUND);
    });

    it("should return 404 when the member does not exist in the group", async () => {
      mockPrisma.group.findUnique
        .mockResolvedValueOnce(group)
        .mockResolvedValueOnce({ id: group.id, createdById: ownerId });
      mockPrisma.groupMember.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .delete(`/api/v1/groups/group-1/members/ghost`)
        .set("Authorization", `Bearer ${signToken(ownerId)}`);

      expect(res.status).toBe(HTTP_STATUSES.NOT_FOUND);
    });

    it("should return 409 when trying to remove the owner", async () => {
      mockPrisma.group.findUnique
        .mockResolvedValueOnce(group)
        .mockResolvedValueOnce({ id: group.id, createdById: ownerId });

      const res = await request(app)
        .delete(`/api/v1/groups/group-1/members/${ownerId}`)
        .set("Authorization", `Bearer ${signToken(ownerId)}`);

      expect(res.status).toBe(HTTP_STATUSES.CONFLICT);
    });
  });
});
