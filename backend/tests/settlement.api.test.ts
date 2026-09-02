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
        findMany: vi.fn(),
      },
      expense: {
        findMany: vi.fn(),
      },
      settlement: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
      },
    },
  };
});

import { prisma } from "../src/db/prisma.js";

const mockPrisma = vi.mocked(prisma);

const ownerId = "owner-1";
const aliceId = "alice-1";
const bobId = "bob-1";
const outsiderId = "outsider-1";

const group = { id: "group-1", name: "Trip to Naran", createdById: ownerId };

function storedSettlement(overrides: Record<string, unknown> = {}) {
  return {
    id: "settlement-1",
    groupId: "group-1",
    payerId: bobId,
    payeeId: aliceId,
    amountMinorUnits: 500n,
    currencyCode: "PKR",
    settledAt: new Date("2026-01-01T00:00:00Z"),
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    payer: { id: bobId, name: "Bob", email: "bob@example.com" },
    payee: { id: aliceId, name: "Alice", email: "alice@example.com" },
    ...overrides,
  };
}

function memberUsers() {
  return [
    {
      userId: ownerId,
      user: { id: ownerId, name: "Owner", email: "owner@example.com" },
    },
    {
      userId: aliceId,
      user: { id: aliceId, name: "Alice", email: "alice@example.com" },
    },
    {
      userId: bobId,
      user: { id: bobId, name: "Bob", email: "bob@example.com" },
    },
  ];
}

function memberIdsOnly() {
  return [{ userId: ownerId }, { userId: aliceId }, { userId: bobId }];
}

const validCreateBody = {
  payerId: bobId,
  payeeId: aliceId,
  amountMinorUnits: 500,
};

describe("Settlements API", () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.group.findUnique.mockReset();
    mockPrisma.groupMember.findMany.mockReset();
    mockPrisma.expense.findMany.mockReset();
    mockPrisma.settlement.create.mockReset();
    mockPrisma.settlement.findUnique.mockReset();
    mockPrisma.settlement.findMany.mockReset();
    app = createApp();
  });

  describe("GET /api/v1/groups/:id/balances", () => {
    it("returns balances for a group member", async () => {
      mockPrisma.group.findUnique.mockResolvedValue(group);
      mockPrisma.groupMember.findMany.mockResolvedValue(memberUsers());
      mockPrisma.expense.findMany.mockResolvedValue([
        {
          paidById: aliceId,
          amountMinorUnits: 300n,
          splits: [
            { userId: aliceId, amountMinorUnits: 100n },
            { userId: bobId, amountMinorUnits: 100n },
            { userId: ownerId, amountMinorUnits: 100n },
          ],
        },
      ]);
      mockPrisma.settlement.findMany.mockResolvedValue([
        { payerId: bobId, payeeId: aliceId, amountMinorUnits: 40n },
      ]);

      const res = await request(app)
        .get("/api/v1/groups/group-1/balances")
        .set("Authorization", `Bearer ${signToken(aliceId)}`);

      expect(res.status).toBe(HTTP_STATUSES.OK);
      expect(res.body.success).toBe(true);
      expect(res.body.data.balances).toHaveLength(3);
      const byUser = new Map(res.body.data.balances.map((b: { userId: string }) => [b.userId, b]));
      expect(byUser.get(aliceId).amountMinorUnits).toBe(160);
      expect(byUser.get(bobId).amountMinorUnits).toBe(-60);
      // forbidden sensitive fields
      expect(JSON.stringify(res.body)).not.toContain("password");
    });

    it("returns 401 without authentication", async () => {
      const res = await request(app).get("/api/v1/groups/group-1/balances");
      expect(res.status).toBe(HTTP_STATUSES.UNAUTHORIZED);
    });

    it("returns 403 for a non-member", async () => {
      mockPrisma.group.findUnique.mockResolvedValue(group);
      mockPrisma.groupMember.findMany.mockResolvedValue(memberUsers());

      const res = await request(app)
        .get("/api/v1/groups/group-1/balances")
        .set("Authorization", `Bearer ${signToken(outsiderId)}`);

      expect(res.status).toBe(HTTP_STATUSES.FORBIDDEN);
    });

    it("returns 404 when the group does not exist", async () => {
      mockPrisma.group.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .get("/api/v1/groups/missing/balances")
        .set("Authorization", `Bearer ${signToken(aliceId)}`);

      expect(res.status).toBe(HTTP_STATUSES.NOT_FOUND);
    });
  });

  describe("POST /api/v1/groups/:id/settlements", () => {
    it("creates a settlement and returns 201", async () => {
      mockPrisma.group.findUnique.mockResolvedValue(group);
      mockPrisma.groupMember.findMany.mockResolvedValue(memberUsers());
      mockPrisma.settlement.create.mockResolvedValue(storedSettlement());

      const res = await request(app)
        .post("/api/v1/groups/group-1/settlements")
        .set("Authorization", `Bearer ${signToken(ownerId)}`)
        .send(validCreateBody);

      expect(res.status).toBe(HTTP_STATUSES.CREATED);
      expect(res.body.success).toBe(true);
      expect(res.body.data.settlement.id).toBe("settlement-1");
      expect(res.body.data.settlement.amountMinorUnits).toBe(500);
    });

    it("returns 401 without authentication", async () => {
      const res = await request(app)
        .post("/api/v1/groups/group-1/settlements")
        .send(validCreateBody);
      expect(res.status).toBe(HTTP_STATUSES.UNAUTHORIZED);
    });

    it("returns 403 when the requester is not a group member", async () => {
      mockPrisma.group.findUnique.mockResolvedValue(group);
      mockPrisma.groupMember.findMany.mockResolvedValue(memberUsers());

      const res = await request(app)
        .post("/api/v1/groups/group-1/settlements")
        .set("Authorization", `Bearer ${signToken(outsiderId)}`)
        .send(validCreateBody);

      expect(res.status).toBe(HTTP_STATUSES.FORBIDDEN);
    });

    it("returns 403 when the sender is not a group member", async () => {
      mockPrisma.group.findUnique.mockResolvedValue(group);
      mockPrisma.groupMember.findMany.mockResolvedValue(memberUsers());

      const res = await request(app)
        .post("/api/v1/groups/group-1/settlements")
        .set("Authorization", `Bearer ${signToken(ownerId)}`)
        .send({ ...validCreateBody, payerId: outsiderId });

      expect(res.status).toBe(HTTP_STATUSES.FORBIDDEN);
    });

    it("returns 403 when the receiver is not a group member", async () => {
      mockPrisma.group.findUnique.mockResolvedValue(group);
      mockPrisma.groupMember.findMany.mockResolvedValue(memberUsers());

      const res = await request(app)
        .post("/api/v1/groups/group-1/settlements")
        .set("Authorization", `Bearer ${signToken(ownerId)}`)
        .send({ ...validCreateBody, payeeId: outsiderId });

      expect(res.status).toBe(HTTP_STATUSES.FORBIDDEN);
    });

    it("returns 400 when sender equals receiver", async () => {
      mockPrisma.group.findUnique.mockResolvedValue(group);
      mockPrisma.groupMember.findMany.mockResolvedValue(memberUsers());

      const res = await request(app)
        .post("/api/v1/groups/group-1/settlements")
        .set("Authorization", `Bearer ${signToken(ownerId)}`)
        .send({ ...validCreateBody, payeeId: bobId });

      expect(res.status).toBe(HTTP_STATUSES.BAD_REQUEST);
    });

    it("returns 400 for a zero amount", async () => {
      const res = await request(app)
        .post("/api/v1/groups/group-1/settlements")
        .set("Authorization", `Bearer ${signToken(ownerId)}`)
        .send({ ...validCreateBody, amountMinorUnits: 0 });

      expect(res.status).toBe(HTTP_STATUSES.BAD_REQUEST);
    });

    it("returns 400 for a negative amount", async () => {
      const res = await request(app)
        .post("/api/v1/groups/group-1/settlements")
        .set("Authorization", `Bearer ${signToken(ownerId)}`)
        .send({ ...validCreateBody, amountMinorUnits: -500 });

      expect(res.status).toBe(HTTP_STATUSES.BAD_REQUEST);
    });

    it("returns 400 for an invalid amount format", async () => {
      const res = await request(app)
        .post("/api/v1/groups/group-1/settlements")
        .set("Authorization", `Bearer ${signToken(ownerId)}`)
        .send({ ...validCreateBody, amountMinorUnits: 10.5 });

      expect(res.status).toBe(HTTP_STATUSES.BAD_REQUEST);
    });

    it("returns 400 when unknown fields are provided", async () => {
      const res = await request(app)
        .post("/api/v1/groups/group-1/settlements")
        .set("Authorization", `Bearer ${signToken(ownerId)}`)
        .send({ ...validCreateBody, createdById: ownerId });

      expect(res.status).toBe(HTTP_STATUSES.BAD_REQUEST);
    });

    it("returns 404 when the group does not exist", async () => {
      mockPrisma.group.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .post("/api/v1/groups/missing/settlements")
        .set("Authorization", `Bearer ${signToken(ownerId)}`)
        .send(validCreateBody);

      expect(res.status).toBe(HTTP_STATUSES.NOT_FOUND);
    });
  });

  describe("GET /api/v1/groups/:id/settlements", () => {
    it("lists only the requested group's settlements for a member", async () => {
      mockPrisma.group.findUnique.mockResolvedValue(group);
      mockPrisma.groupMember.findMany.mockResolvedValue(memberUsers());
      mockPrisma.settlement.findMany.mockResolvedValue([storedSettlement()]);

      const res = await request(app)
        .get("/api/v1/groups/group-1/settlements")
        .set("Authorization", `Bearer ${signToken(aliceId)}`);

      expect(res.status).toBe(HTTP_STATUSES.OK);
      expect(res.body.success).toBe(true);
      expect(res.body.data.settlements).toHaveLength(1);
      expect(mockPrisma.settlement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { groupId: "group-1" } }),
      );
    });

    it("returns 401 without authentication", async () => {
      const res = await request(app).get("/api/v1/groups/group-1/settlements");
      expect(res.status).toBe(HTTP_STATUSES.UNAUTHORIZED);
    });

    it("returns 403 for a non-member", async () => {
      mockPrisma.group.findUnique.mockResolvedValue(group);
      mockPrisma.groupMember.findMany.mockResolvedValue(memberUsers());

      const res = await request(app)
        .get("/api/v1/groups/group-1/settlements")
        .set("Authorization", `Bearer ${signToken(outsiderId)}`);

      expect(res.status).toBe(HTTP_STATUSES.FORBIDDEN);
    });

    it("returns 404 when the group does not exist", async () => {
      mockPrisma.group.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .get("/api/v1/groups/missing/settlements")
        .set("Authorization", `Bearer ${signToken(aliceId)}`);

      expect(res.status).toBe(HTTP_STATUSES.NOT_FOUND);
    });
  });

  describe("GET /api/v1/settlements/:id", () => {
    it("returns a settlement for a member of its group", async () => {
      mockPrisma.settlement.findUnique.mockResolvedValue(storedSettlement());
      mockPrisma.groupMember.findMany.mockResolvedValue(memberUsers());

      const res = await request(app)
        .get("/api/v1/settlements/settlement-1")
        .set("Authorization", `Bearer ${signToken(aliceId)}`);

      expect(res.status).toBe(HTTP_STATUSES.OK);
      expect(res.body.success).toBe(true);
      expect(res.body.data.settlement.id).toBe("settlement-1");
      expect(res.body.data.settlement.amountMinorUnits).toBe(500);
    });

    it("returns 401 without authentication", async () => {
      const res = await request(app).get("/api/v1/settlements/settlement-1");
      expect(res.status).toBe(HTTP_STATUSES.UNAUTHORIZED);
    });

    it("returns 403 for a non-member (IDOR)", async () => {
      mockPrisma.settlement.findUnique.mockResolvedValue(storedSettlement());
      mockPrisma.groupMember.findMany.mockResolvedValue(memberIdsOnly());

      const res = await request(app)
        .get("/api/v1/settlements/settlement-1")
        .set("Authorization", `Bearer ${signToken(outsiderId)}`);

      expect(res.status).toBe(HTTP_STATUSES.FORBIDDEN);
    });

    it("returns 404 when the settlement does not exist", async () => {
      mockPrisma.settlement.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .get("/api/v1/settlements/missing")
        .set("Authorization", `Bearer ${signToken(aliceId)}`);

      expect(res.status).toBe(HTTP_STATUSES.NOT_FOUND);
    });

    it("does not expose sensitive user fields", async () => {
      mockPrisma.settlement.findUnique.mockResolvedValue(storedSettlement());
      mockPrisma.groupMember.findMany.mockResolvedValue(memberUsers());

      const res = await request(app)
        .get("/api/v1/settlements/settlement-1")
        .set("Authorization", `Bearer ${signToken(aliceId)}`);

      expect(res.status).toBe(HTTP_STATUSES.OK);
      expect(JSON.stringify(res.body)).not.toContain("passwordHash");
      expect(JSON.stringify(res.body)).not.toContain("password");
    });
  });
});
