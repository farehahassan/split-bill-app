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
      },
      groupMember: {
        findMany: vi.fn(),
      },
      expense: {
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
const payerId = "payer-1";
const memberId = "member-1";
const outsiderId = "outsider-1";

const group = { id: "group-1", name: "Trip to Naran", createdById: ownerId };

function storedExpense(overrides: Record<string, unknown> = {}) {
  return {
    id: "expense-1",
    groupId: "group-1",
    paidById: payerId,
    description: "Dinner",
    amountMinorUnits: 1000n,
    currencyCode: "PKR",
    splitType: "EQUAL",
    expenseDate: new Date("2026-01-01T00:00:00Z"),
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    payer: { id: payerId, name: "Payer", email: "payer@example.com" },
    splits: [
      {
        id: "split-1",
        expenseId: "expense-1",
        userId: payerId,
        amountMinorUnits: 334n,
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-01T00:00:00Z"),
        user: { id: payerId, name: "Payer", email: "payer@example.com" },
      },
      {
        id: "split-2",
        expenseId: "expense-1",
        userId: memberId,
        amountMinorUnits: 333n,
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-01T00:00:00Z"),
        user: { id: memberId, name: "Member", email: "member@example.com" },
      },
      {
        id: "split-3",
        expenseId: "expense-1",
        userId: ownerId,
        amountMinorUnits: 333n,
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-01T00:00:00Z"),
        user: { id: ownerId, name: "Owner", email: "owner@example.com" },
      },
    ],
    ...overrides,
  };
}

const validCreateBody = {
  description: "Dinner",
  amountMinorUnits: 1000,
  payerId,
  splitType: "EQUAL",
  participants: [{ userId: payerId }, { userId: memberId }, { userId: ownerId }],
};

describe("Expenses API", () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$transaction.mockReset();
    mockPrisma.group.findUnique.mockReset();
    mockPrisma.group.findMany.mockReset();
    mockPrisma.groupMember.findMany.mockReset();
    mockPrisma.expense.create.mockReset();
    mockPrisma.expense.findUnique.mockReset();
    mockPrisma.expense.findMany.mockReset();
    app = createApp();
  });

  describe("POST /api/v1/groups/:id/expenses", () => {
    it("should create an expense with EQUAL splits and return 201", async () => {
      mockPrisma.group.findUnique.mockResolvedValue(group);
      mockPrisma.groupMember.findMany.mockResolvedValue([
        { userId: ownerId },
        { userId: payerId },
        { userId: memberId },
      ]);
      const created = storedExpense();
      mockPrisma.$transaction.mockImplementation(async (fn) => {
        const tx = { expense: { create: vi.fn().mockResolvedValue(created) } };
        return fn(tx);
      });

      const res = await request(app)
        .post("/api/v1/groups/group-1/expenses")
        .set("Authorization", `Bearer ${signToken(ownerId)}`)
        .send(validCreateBody);

      expect(res.status).toBe(HTTP_STATUSES.CREATED);
      expect(res.body.success).toBe(true);
      expect(res.body.data.expense.id).toBe("expense-1");
      expect(res.body.data.expense.amountMinorUnits).toBe(1000);
      expect(res.body.data.expense.splits).toHaveLength(3);
      const sum = res.body.data.expense.splits.reduce(
        (acc: number, split: { amountMinorUnits: number }) => acc + split.amountMinorUnits,
        0,
      );
      expect(sum).toBe(1000);
    });

    it("should return 401 without authentication", async () => {
      const res = await request(app).post("/api/v1/groups/group-1/expenses").send(validCreateBody);

      expect(res.status).toBe(HTTP_STATUSES.UNAUTHORIZED);
    });

    it("should return 403 for a non-member requester", async () => {
      mockPrisma.group.findUnique.mockResolvedValue(group);
      mockPrisma.groupMember.findMany.mockResolvedValue([
        { userId: ownerId },
        { userId: payerId },
        { userId: memberId },
      ]);

      const res = await request(app)
        .post("/api/v1/groups/group-1/expenses")
        .set("Authorization", `Bearer ${signToken(outsiderId)}`)
        .send(validCreateBody);

      expect(res.status).toBe(HTTP_STATUSES.FORBIDDEN);
    });

    it("should return 403 when the payer is not a group member", async () => {
      mockPrisma.group.findUnique.mockResolvedValue(group);
      mockPrisma.groupMember.findMany.mockResolvedValue([
        { userId: ownerId },
        { userId: memberId },
      ]);

      const res = await request(app)
        .post("/api/v1/groups/group-1/expenses")
        .set("Authorization", `Bearer ${signToken(ownerId)}`)
        .send(validCreateBody);

      expect(res.status).toBe(HTTP_STATUSES.FORBIDDEN);
    });

    it("should return 404 when the group does not exist", async () => {
      mockPrisma.group.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .post("/api/v1/groups/missing/expenses")
        .set("Authorization", `Bearer ${signToken(ownerId)}`)
        .send(validCreateBody);

      expect(res.status).toBe(HTTP_STATUSES.NOT_FOUND);
    });

    it("should return 400 when validation fails (negative amount)", async () => {
      mockPrisma.group.findUnique.mockResolvedValue(group);
      mockPrisma.groupMember.findMany.mockResolvedValue([
        { userId: ownerId },
        { userId: payerId },
        { userId: memberId },
      ]);

      const res = await request(app)
        .post("/api/v1/groups/group-1/expenses")
        .set("Authorization", `Bearer ${signToken(ownerId)}`)
        .send({ ...validCreateBody, amountMinorUnits: -100 });

      expect(res.status).toBe(HTTP_STATUSES.BAD_REQUEST);
      expect(res.body.errors).toBeDefined();
    });

    it("should return 400 for an invalid splitType", async () => {
      const res = await request(app)
        .post("/api/v1/groups/group-1/expenses")
        .set("Authorization", `Bearer ${signToken(ownerId)}`)
        .send({ ...validCreateBody, splitType: "PERCENTAGE" });

      expect(res.status).toBe(HTTP_STATUSES.BAD_REQUEST);
    });

    it("should return 400 for an empty participants array", async () => {
      const res = await request(app)
        .post("/api/v1/groups/group-1/expenses")
        .set("Authorization", `Bearer ${signToken(ownerId)}`)
        .send({ ...validCreateBody, participants: [] });

      expect(res.status).toBe(HTTP_STATUSES.BAD_REQUEST);
    });

    it("should reject unexpected body fields", async () => {
      const res = await request(app)
        .post("/api/v1/groups/group-1/expenses")
        .set("Authorization", `Bearer ${signToken(ownerId)}`)
        .send({ ...validCreateBody, createdById: outsiderId });

      expect(res.status).toBe(HTTP_STATUSES.BAD_REQUEST);
    });

    it("should return 400 when EXACT split amounts do not match the total", async () => {
      mockPrisma.group.findUnique.mockResolvedValue(group);
      mockPrisma.groupMember.findMany.mockResolvedValue([
        { userId: ownerId },
        { userId: payerId },
        { userId: memberId },
      ]);

      const res = await request(app)
        .post("/api/v1/groups/group-1/expenses")
        .set("Authorization", `Bearer ${signToken(ownerId)}`)
        .send({
          description: "Dinner",
          amountMinorUnits: 5000,
          payerId,
          splitType: "EXACT",
          participants: [
            { userId: payerId, amountMinorUnits: 3000 },
            { userId: memberId, amountMinorUnits: 1000 },
            { userId: ownerId, amountMinorUnits: 500 },
          ],
        });

      expect(res.status).toBe(HTTP_STATUSES.BAD_REQUEST);
    });
  });

  describe("GET /api/v1/groups/:id/expenses", () => {
    it("should return 200 with the group's expenses for a member", async () => {
      mockPrisma.group.findUnique.mockResolvedValue(group);
      mockPrisma.groupMember.findMany.mockResolvedValue([
        { userId: ownerId },
        { userId: payerId },
        { userId: memberId },
      ]);
      mockPrisma.expense.findMany.mockResolvedValue([
        {
          id: "expense-1",
          groupId: "group-1",
          paidById: payerId,
          description: "Dinner",
          amountMinorUnits: 1000n,
          currencyCode: "PKR",
          splitType: "EQUAL",
          expenseDate: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
          payer: { id: payerId, name: "Payer", email: "payer@example.com" },
          _count: { splits: 3 },
        },
      ]);

      const res = await request(app)
        .get("/api/v1/groups/group-1/expenses")
        .set("Authorization", `Bearer ${signToken(ownerId)}`);

      expect(res.status).toBe(HTTP_STATUSES.OK);
      expect(res.body.success).toBe(true);
      expect(res.body.data.expenses).toHaveLength(1);
      expect(res.body.data.expenses[0].splitCount).toBe(3);
      expect(res.body.data.expenses[0].amountMinorUnits).toBe(1000);
    });

    it("should return 401 without authentication", async () => {
      const res = await request(app).get("/api/v1/groups/group-1/expenses");

      expect(res.status).toBe(HTTP_STATUSES.UNAUTHORIZED);
    });

    it("should return 403 for a non-member", async () => {
      mockPrisma.group.findUnique.mockResolvedValue(group);
      mockPrisma.groupMember.findMany.mockResolvedValue([
        { userId: ownerId },
        { userId: payerId },
        { userId: memberId },
      ]);

      const res = await request(app)
        .get("/api/v1/groups/group-1/expenses")
        .set("Authorization", `Bearer ${signToken(outsiderId)}`);

      expect(res.status).toBe(HTTP_STATUSES.FORBIDDEN);
    });

    it("should return 404 when the group does not exist", async () => {
      mockPrisma.group.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .get("/api/v1/groups/missing/expenses")
        .set("Authorization", `Bearer ${signToken(ownerId)}`);

      expect(res.status).toBe(HTTP_STATUSES.NOT_FOUND);
    });
  });

  describe("GET /api/v1/expenses/:id", () => {
    it("should return 200 with expense details for a group member", async () => {
      mockPrisma.expense.findUnique.mockResolvedValue(storedExpense());
      mockPrisma.groupMember.findMany.mockResolvedValue([
        { userId: ownerId },
        { userId: payerId },
        { userId: memberId },
      ]);

      const res = await request(app)
        .get("/api/v1/expenses/expense-1")
        .set("Authorization", `Bearer ${signToken(memberId)}`);

      expect(res.status).toBe(HTTP_STATUSES.OK);
      expect(res.body.success).toBe(true);
      expect(res.body.data.expense.id).toBe("expense-1");
      expect(res.body.data.expense.splits).toHaveLength(3);
    });

    it("should return 401 without authentication", async () => {
      const res = await request(app).get("/api/v1/expenses/expense-1");

      expect(res.status).toBe(HTTP_STATUSES.UNAUTHORIZED);
    });

    it("should return 403 for a non-member of the expense's group", async () => {
      mockPrisma.expense.findUnique.mockResolvedValue(storedExpense());
      mockPrisma.groupMember.findMany.mockResolvedValue([
        { userId: ownerId },
        { userId: payerId },
        { userId: memberId },
      ]);

      const res = await request(app)
        .get("/api/v1/expenses/expense-1")
        .set("Authorization", `Bearer ${signToken(outsiderId)}`);

      expect(res.status).toBe(HTTP_STATUSES.FORBIDDEN);
    });

    it("should return 404 when the expense does not exist", async () => {
      mockPrisma.expense.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .get("/api/v1/expenses/missing")
        .set("Authorization", `Bearer ${signToken(ownerId)}`);

      expect(res.status).toBe(HTTP_STATUSES.NOT_FOUND);
    });

    it("should not expose the passwordHash of any user", async () => {
      mockPrisma.expense.findUnique.mockResolvedValue(storedExpense());
      mockPrisma.groupMember.findMany.mockResolvedValue([
        { userId: ownerId },
        { userId: payerId },
        { userId: memberId },
      ]);

      const res = await request(app)
        .get("/api/v1/expenses/expense-1")
        .set("Authorization", `Bearer ${signToken(memberId)}`);

      expect(res.status).toBe(HTTP_STATUSES.OK);
      expect(JSON.stringify(res.body)).not.toContain("passwordHash");
      expect(JSON.stringify(res.body)).not.toContain("password");
    });
  });
});
