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
      group: {
        findUnique: vi.fn(),
      },
      groupMember: {
        findUnique: vi.fn(),
      },
      activityEvent: {
        findMany: vi.fn(),
        count: vi.fn(),
      },
    },
  };
});

import { prisma } from "../src/db/prisma.js";

const mockPrisma = vi.mocked(prisma);

const ownerId = "55555555-5555-4555-8555-555555555555";
const memberId = "66666666-6666-4666-8666-666666666666";
const outsiderId = "88888888-8888-4888-8888-888888888888";

const group = { id: "11111111-1111-4111-8111-111111111111", name: "Trip to Naran", createdById: ownerId };
const membership = { id: "membership-1", groupId: "11111111-1111-4111-8111-111111111111", userId: memberId };

function storedEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "event-1",
    groupId: "11111111-1111-4111-8111-111111111111",
    userId: memberId,
    type: "EXPENSE_ADDED",
    message: "added the expense \"Dinner\"",
    amountMinorUnits: 1000n,
    currencyCode: "PKR",
    occurredAt: new Date("2026-01-02T00:00:00Z"),
    createdAt: new Date("2026-01-02T00:00:00Z"),
    user: { id: memberId, name: "Member", email: "member@example.com" },
    ...overrides,
  };
}

describe("Activity API", () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.group.findUnique.mockReset();
    mockPrisma.groupMember.findUnique.mockReset();
    mockPrisma.activityEvent.findMany.mockReset();
    mockPrisma.activityEvent.count.mockReset();
    app = createApp();
  });

  describe("GET /api/v1/groups/:id/activity", () => {
    it("returns 200 with events and pagination metadata for a member", async () => {
      mockPrisma.group.findUnique.mockResolvedValue(group);
      mockPrisma.groupMember.findUnique.mockResolvedValue(membership);
      mockPrisma.activityEvent.findMany.mockResolvedValue([storedEvent()]);
      mockPrisma.activityEvent.count.mockResolvedValue(1);

      const res = await request(app)
        .get("/api/v1/groups/11111111-1111-4111-8111-111111111111/activity?page=1&limit=20")
        .set("Authorization", `Bearer ${signToken(memberId)}`);

      expect(res.status).toBe(HTTP_STATUSES.OK);
      expect(res.body.success).toBe(true);
      expect(res.body.data.events).toHaveLength(1);
      expect(res.body.data.events[0].id).toBe("event-1");
      expect(res.body.data.events[0].amountMinorUnits).toBe(1000);
      expect(res.body.pagination).toEqual({ page: 1, limit: 20, total: 1 });
    });

    it("returns 401 without authentication", async () => {
      const res = await request(app).get("/api/v1/groups/11111111-1111-4111-8111-111111111111/activity");

      expect(res.status).toBe(HTTP_STATUSES.UNAUTHORIZED);
    });

    it("returns 403 for a non-member", async () => {
      mockPrisma.group.findUnique.mockResolvedValue(group);
      mockPrisma.groupMember.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .get("/api/v1/groups/11111111-1111-4111-8111-111111111111/activity")
        .set("Authorization", `Bearer ${signToken(outsiderId)}`);

      expect(res.status).toBe(HTTP_STATUSES.FORBIDDEN);
      expect(mockPrisma.activityEvent.findMany).not.toHaveBeenCalled();
    });

    it("returns 404 when the group does not exist", async () => {
      mockPrisma.group.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .get("/api/v1/groups/00000000-0000-4000-8000-000000000099/activity")
        .set("Authorization", `Bearer ${signToken(memberId)}`);

      expect(res.status).toBe(HTTP_STATUSES.NOT_FOUND);
      expect(mockPrisma.groupMember.findUnique).not.toHaveBeenCalled();
    });

    it("returns 400 for a blank group id", async () => {
      const res = await request(app)
        .get("/api/v1/groups/%20/activity")
        .set("Authorization", `Bearer ${signToken(memberId)}`);

      expect(res.status).toBe(HTTP_STATUSES.BAD_REQUEST);
      expect(res.body.errors).toBeDefined();
    });

    it("applies default pagination when none is provided", async () => {
      mockPrisma.group.findUnique.mockResolvedValue(group);
      mockPrisma.groupMember.findUnique.mockResolvedValue(membership);
      mockPrisma.activityEvent.findMany.mockResolvedValue([]);
      mockPrisma.activityEvent.count.mockResolvedValue(0);

      const res = await request(app)
        .get("/api/v1/groups/11111111-1111-4111-8111-111111111111/activity")
        .set("Authorization", `Bearer ${signToken(memberId)}`);

      expect(res.status).toBe(HTTP_STATUSES.OK);
      expect(mockPrisma.activityEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 20 }),
      );
      expect(res.body.pagination).toEqual({ page: 1, limit: 20, total: 0 });
    });

    it("returns 400 for an invalid page (zero)", async () => {
      const res = await request(app)
        .get("/api/v1/groups/11111111-1111-4111-8111-111111111111/activity?page=0")
        .set("Authorization", `Bearer ${signToken(memberId)}`);

      expect(res.status).toBe(HTTP_STATUSES.BAD_REQUEST);
    });

    it("returns 400 for an invalid page (non-numeric)", async () => {
      const res = await request(app)
        .get("/api/v1/groups/11111111-1111-4111-8111-111111111111/activity?page=abc")
        .set("Authorization", `Bearer ${signToken(memberId)}`);

      expect(res.status).toBe(HTTP_STATUSES.BAD_REQUEST);
    });

    it("returns 400 for an invalid page (fraction)", async () => {
      const res = await request(app)
        .get("/api/v1/groups/11111111-1111-4111-8111-111111111111/activity?page=1.5")
        .set("Authorization", `Bearer ${signToken(memberId)}`);

      expect(res.status).toBe(HTTP_STATUSES.BAD_REQUEST);
    });

    it("returns 400 for an invalid limit (zero)", async () => {
      const res = await request(app)
        .get("/api/v1/groups/11111111-1111-4111-8111-111111111111/activity?limit=0")
        .set("Authorization", `Bearer ${signToken(memberId)}`);

      expect(res.status).toBe(HTTP_STATUSES.BAD_REQUEST);
    });

    it("returns 400 for an invalid limit (negative)", async () => {
      const res = await request(app)
        .get("/api/v1/groups/11111111-1111-4111-8111-111111111111/activity?limit=-5")
        .set("Authorization", `Bearer ${signToken(memberId)}`);

      expect(res.status).toBe(HTTP_STATUSES.BAD_REQUEST);
    });

    it("returns 400 for an excessive limit", async () => {
      const res = await request(app)
        .get("/api/v1/groups/11111111-1111-4111-8111-111111111111/activity?limit=51")
        .set("Authorization", `Bearer ${signToken(memberId)}`);

      expect(res.status).toBe(HTTP_STATUSES.BAD_REQUEST);
    });

    it("rejects unknown query parameters", async () => {
      const res = await request(app)
        .get("/api/v1/groups/11111111-1111-4111-8111-111111111111/activity?foo=bar")
        .set("Authorization", `Bearer ${signToken(memberId)}`);

      expect(res.status).toBe(HTTP_STATUSES.BAD_REQUEST);
    });

    it("returns an empty feed and zero total for a group with no activity", async () => {
      mockPrisma.group.findUnique.mockResolvedValue(group);
      mockPrisma.groupMember.findUnique.mockResolvedValue(membership);
      mockPrisma.activityEvent.findMany.mockResolvedValue([]);
      mockPrisma.activityEvent.count.mockResolvedValue(0);

      const res = await request(app)
        .get("/api/v1/groups/11111111-1111-4111-8111-111111111111/activity")
        .set("Authorization", `Bearer ${signToken(memberId)}`);

      expect(res.status).toBe(HTTP_STATUSES.OK);
      expect(res.body.data.events).toEqual([]);
      expect(res.body.pagination.total).toBe(0);
    });

    it("applies skip/take for the requested page", async () => {
      mockPrisma.group.findUnique.mockResolvedValue(group);
      mockPrisma.groupMember.findUnique.mockResolvedValue(membership);
      mockPrisma.activityEvent.findMany.mockResolvedValue([]);
      mockPrisma.activityEvent.count.mockResolvedValue(0);

      await request(app)
        .get("/api/v1/groups/11111111-1111-4111-8111-111111111111/activity?page=2&limit=10")
        .set("Authorization", `Bearer ${signToken(memberId)}`);

      expect(mockPrisma.activityEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      );
      expect(mockPrisma.activityEvent.count).toHaveBeenCalledWith({
        where: { groupId: "11111111-1111-4111-8111-111111111111" },
      });
    });

    it("filters strictly by the requested group at the database level (no cross-group leakage)", async () => {
      mockPrisma.group.findUnique.mockResolvedValue(group);
      mockPrisma.groupMember.findUnique.mockResolvedValue(membership);
      mockPrisma.activityEvent.findMany.mockResolvedValue([]);
      mockPrisma.activityEvent.count.mockResolvedValue(0);

      await request(app)
        .get("/api/v1/groups/11111111-1111-4111-8111-111111111111/activity")
        .set("Authorization", `Bearer ${signToken(memberId)}`);

      expect(mockPrisma.activityEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { groupId: "11111111-1111-4111-8111-111111111111" } }),
      );
    });

    it("orders events deterministically by occurredAt", async () => {
      mockPrisma.group.findUnique.mockResolvedValue(group);
      mockPrisma.groupMember.findUnique.mockResolvedValue(membership);
      mockPrisma.activityEvent.findMany.mockResolvedValue([]);
      mockPrisma.activityEvent.count.mockResolvedValue(0);

      await request(app)
        .get("/api/v1/groups/11111111-1111-4111-8111-111111111111/activity")
        .set("Authorization", `Bearer ${signToken(memberId)}`);

      expect(mockPrisma.activityEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ occurredAt: "desc" }, { id: "asc" }],
        }),
      );
    });

    it("never exposes sensitive user fields", async () => {
      mockPrisma.group.findUnique.mockResolvedValue(group);
      mockPrisma.groupMember.findUnique.mockResolvedValue(membership);
      mockPrisma.activityEvent.findMany.mockResolvedValue([storedEvent()]);
      mockPrisma.activityEvent.count.mockResolvedValue(1);

      const res = await request(app)
        .get("/api/v1/groups/11111111-1111-4111-8111-111111111111/activity")
        .set("Authorization", `Bearer ${signToken(memberId)}`);

      expect(res.status).toBe(HTTP_STATUSES.OK);
      expect(JSON.stringify(res.body)).not.toContain("passwordHash");
      expect(JSON.stringify(res.body)).not.toContain("password");
    });
  });
});