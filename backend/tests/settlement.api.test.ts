import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { Prisma } from "@prisma/client";

import { createApp } from "../src/app.js";
import { HTTP_STATUSES } from "../src/constants/http-statuses.js";
import { createRequestHash } from "../src/modules/idempotency/request-hash.js";

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
      idempotencyRecord: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        deleteMany: vi.fn(),
      },
    },
  };
});

import { prisma } from "../src/db/prisma.js";

const mockPrisma = vi.mocked(prisma);

const ownerId = "55555555-5555-4555-8555-555555555555";
const aliceId = "99999999-9999-4999-8999-999999999999";
const bobId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const outsiderId = "88888888-8888-4888-8888-888888888888";
const idemKey = "key-12345678";

const group = { id: "11111111-1111-4111-8111-111111111111", name: "Trip to Naran", createdById: ownerId };

const validCreateBody = {
  payerId: bobId,
  payeeId: aliceId,
  amountMinorUnits: 500,
};

function hashOf(body: { payerId: string; payeeId: string; amountMinorUnits: number }, id = "11111111-1111-4111-8111-111111111111") {
  return createRequestHash({
    groupId: id,
    payerId: body.payerId,
    payeeId: body.payeeId,
    amountMinorUnits: body.amountMinorUnits,
  });
}

function storedSettlement(overrides: Record<string, unknown> = {}) {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    groupId: "11111111-1111-4111-8111-111111111111",
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

function idempotencyRecordRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "idem-1",
    key: idemKey,
    userId: ownerId,
    requestHash: hashOf(validCreateBody),
    status: "COMPLETED",
    operation: "SETTLEMENT_CREATE",
    scope: "11111111-1111-4111-8111-111111111111",
    resourceId: "44444444-4444-4444-8444-444444444444",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    expiresAt: new Date(Date.now() + 60_000),
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

function makeTx() {
  return {
    idempotencyRecord: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    settlement: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    activityEvent: {
      create: vi.fn().mockResolvedValue({ id: "event-1" }),
    },
  };
}

function runTransaction(tx: ReturnType<typeof makeTx>) {
  return async (callback: (t: typeof tx) => Promise<unknown>): Promise<unknown> => callback(tx);
}

function freshCreateTx() {
  const tx = makeTx();
  tx.idempotencyRecord.findUnique.mockResolvedValue(null);
  tx.idempotencyRecord.create.mockResolvedValue(idempotencyRecordRow({ status: "PENDING" }));
  tx.settlement.create.mockResolvedValue(storedSettlement());
  tx.idempotencyRecord.update.mockResolvedValue(idempotencyRecordRow());
  tx.activityEvent.create.mockResolvedValue({ id: "event-1" });
  return tx;
}

describe("Settlements API", () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$transaction.mockReset();
    mockPrisma.group.findUnique.mockReset();
    mockPrisma.groupMember.findMany.mockReset();
    mockPrisma.expense.findMany.mockReset();
    mockPrisma.settlement.create.mockReset();
    mockPrisma.settlement.findUnique.mockReset();
    mockPrisma.settlement.findMany.mockReset();
    mockPrisma.idempotencyRecord.findUnique.mockReset();
    mockPrisma.idempotencyRecord.create.mockReset();
    mockPrisma.idempotencyRecord.update.mockReset();
    mockPrisma.idempotencyRecord.deleteMany.mockReset();
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
        .get("/api/v1/groups/11111111-1111-4111-8111-111111111111/balances")
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
      const res = await request(app).get("/api/v1/groups/11111111-1111-4111-8111-111111111111/balances");
      expect(res.status).toBe(HTTP_STATUSES.UNAUTHORIZED);
    });

    it("returns 403 for a non-member", async () => {
      mockPrisma.group.findUnique.mockResolvedValue(group);
      mockPrisma.groupMember.findMany.mockResolvedValue(memberUsers());

      const res = await request(app)
        .get("/api/v1/groups/11111111-1111-4111-8111-111111111111/balances")
        .set("Authorization", `Bearer ${signToken(outsiderId)}`);

      expect(res.status).toBe(HTTP_STATUSES.FORBIDDEN);
    });

    it("returns 404 when the group does not exist", async () => {
      mockPrisma.group.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .get("/api/v1/groups/00000000-0000-4000-8000-000000000099/balances")
        .set("Authorization", `Bearer ${signToken(aliceId)}`);

      expect(res.status).toBe(HTTP_STATUSES.NOT_FOUND);
    });
  });

  describe("POST /api/v1/groups/:id/settlements", () => {
    it("creates a settlement, claims the idempotency key, and returns 201", async () => {
      mockPrisma.group.findUnique.mockResolvedValue(group);
      mockPrisma.groupMember.findMany.mockResolvedValue(memberUsers());
const tx = freshCreateTx();
      mockPrisma.$transaction.mockImplementation(runTransaction(tx));

      const res = await request(app)
        .post("/api/v1/groups/11111111-1111-4111-8111-111111111111/settlements")
        .set("Authorization", `Bearer ${signToken(ownerId)}`)
        .set("Idempotency-Key", idemKey)
        .send(validCreateBody);

      expect(res.status).toBe(HTTP_STATUSES.CREATED);
      expect(res.body.success).toBe(true);
      expect(res.body.data.settlement.id).toBe("44444444-4444-4444-8444-444444444444");
      expect(res.body.data.settlement.amountMinorUnits).toBe(500);
      expect(tx.settlement.create).toHaveBeenCalledTimes(1);
      expect(tx.idempotencyRecord.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          key: idemKey,
          userId: ownerId,
          requestHash: hashOf(validCreateBody),
          status: "PENDING",
          operation: "SETTLEMENT_CREATE",
          scope: "11111111-1111-4111-8111-111111111111",
        }),
      });
      expect(tx.idempotencyRecord.update).toHaveBeenCalledWith({
        where: { id: "idem-1" },
        data: { status: "COMPLETED", resourceId: "44444444-4444-4444-8444-444444444444" },
      });
      expect(JSON.stringify(res.body)).not.toContain(idemKey);
      expect(JSON.stringify(res.body)).not.toContain("requestHash");
    });

    it("returns 401 without authentication", async () => {
      const res = await request(app)
        .post("/api/v1/groups/11111111-1111-4111-8111-111111111111/settlements")
        .send(validCreateBody);
      expect(res.status).toBe(HTTP_STATUSES.UNAUTHORIZED);
    });

    it("returns 403 when the requester is not a group member", async () => {
      mockPrisma.group.findUnique.mockResolvedValue(group);
      mockPrisma.groupMember.findMany.mockResolvedValue(memberUsers());

      const res = await request(app)
        .post("/api/v1/groups/11111111-1111-4111-8111-111111111111/settlements")
        .set("Authorization", `Bearer ${signToken(outsiderId)}`)
        .set("Idempotency-Key", idemKey)
        .send(validCreateBody);

      expect(res.status).toBe(HTTP_STATUSES.FORBIDDEN);
    });

    it("returns 403 when the sender is not a group member", async () => {
      mockPrisma.group.findUnique.mockResolvedValue(group);
      mockPrisma.groupMember.findMany.mockResolvedValue(memberUsers());

      const res = await request(app)
        .post("/api/v1/groups/11111111-1111-4111-8111-111111111111/settlements")
        .set("Authorization", `Bearer ${signToken(ownerId)}`)
        .set("Idempotency-Key", idemKey)
        .send({ ...validCreateBody, payerId: outsiderId });

      expect(res.status).toBe(HTTP_STATUSES.FORBIDDEN);
    });

    it("returns 403 when the receiver is not a group member", async () => {
      mockPrisma.group.findUnique.mockResolvedValue(group);
      mockPrisma.groupMember.findMany.mockResolvedValue(memberUsers());

      const res = await request(app)
        .post("/api/v1/groups/11111111-1111-4111-8111-111111111111/settlements")
        .set("Authorization", `Bearer ${signToken(ownerId)}`)
        .set("Idempotency-Key", idemKey)
        .send({ ...validCreateBody, payeeId: outsiderId });

      expect(res.status).toBe(HTTP_STATUSES.FORBIDDEN);
    });

    it("returns 400 when sender equals receiver", async () => {
      mockPrisma.group.findUnique.mockResolvedValue(group);
      mockPrisma.groupMember.findMany.mockResolvedValue(memberUsers());

      const res = await request(app)
        .post("/api/v1/groups/11111111-1111-4111-8111-111111111111/settlements")
        .set("Authorization", `Bearer ${signToken(ownerId)}`)
        .set("Idempotency-Key", idemKey)
        .send({ ...validCreateBody, payeeId: bobId });

      expect(res.status).toBe(HTTP_STATUSES.BAD_REQUEST);
    });

    it("returns 400 for a zero amount", async () => {
      const res = await request(app)
        .post("/api/v1/groups/11111111-1111-4111-8111-111111111111/settlements")
        .set("Authorization", `Bearer ${signToken(ownerId)}`)
        .set("Idempotency-Key", idemKey)
        .send({ ...validCreateBody, amountMinorUnits: 0 });

      expect(res.status).toBe(HTTP_STATUSES.BAD_REQUEST);
    });

    it("returns 400 for a negative amount", async () => {
      const res = await request(app)
        .post("/api/v1/groups/11111111-1111-4111-8111-111111111111/settlements")
        .set("Authorization", `Bearer ${signToken(ownerId)}`)
        .set("Idempotency-Key", idemKey)
        .send({ ...validCreateBody, amountMinorUnits: -500 });

      expect(res.status).toBe(HTTP_STATUSES.BAD_REQUEST);
    });

    it("returns 400 for an invalid amount format", async () => {
      const res = await request(app)
        .post("/api/v1/groups/11111111-1111-4111-8111-111111111111/settlements")
        .set("Authorization", `Bearer ${signToken(ownerId)}`)
        .set("Idempotency-Key", idemKey)
        .send({ ...validCreateBody, amountMinorUnits: 10.5 });

      expect(res.status).toBe(HTTP_STATUSES.BAD_REQUEST);
    });

    it("returns 400 when unknown fields are provided", async () => {
      const res = await request(app)
        .post("/api/v1/groups/11111111-1111-4111-8111-111111111111/settlements")
        .set("Authorization", `Bearer ${signToken(ownerId)}`)
        .set("Idempotency-Key", idemKey)
        .send({ ...validCreateBody, createdById: ownerId });

      expect(res.status).toBe(HTTP_STATUSES.BAD_REQUEST);
    });

    it("returns 404 when the group does not exist", async () => {
      mockPrisma.group.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .post("/api/v1/groups/00000000-0000-4000-8000-000000000099/settlements")
        .set("Authorization", `Bearer ${signToken(ownerId)}`)
        .set("Idempotency-Key", idemKey)
        .send(validCreateBody);

      expect(res.status).toBe(HTTP_STATUSES.NOT_FOUND);
    });
  });

  describe("POST /api/v1/groups/:id/settlements (idempotency)", () => {
    it("returns 400 when the Idempotency-Key header is missing", async () => {
      const res = await request(app)
        .post("/api/v1/groups/11111111-1111-4111-8111-111111111111/settlements")
        .set("Authorization", `Bearer ${signToken(ownerId)}`)
        .send(validCreateBody);

      expect(res.status).toBe(HTTP_STATUSES.BAD_REQUEST);
      expect(res.body.success).toBe(false);
    });

    it("returns 400 for a too-short Idempotency-Key", async () => {
      const res = await request(app)
        .post("/api/v1/groups/11111111-1111-4111-8111-111111111111/settlements")
        .set("Authorization", `Bearer ${signToken(ownerId)}`)
        .set("Idempotency-Key", "short")
        .send(validCreateBody);

      expect(res.status).toBe(HTTP_STATUSES.BAD_REQUEST);
    });

    it("returns 400 for an empty Idempotency-Key", async () => {
      const res = await request(app)
        .post("/api/v1/groups/11111111-1111-4111-8111-111111111111/settlements")
        .set("Authorization", `Bearer ${signToken(ownerId)}`)
        .set("Idempotency-Key", "   ")
        .send(validCreateBody);

      expect(res.status).toBe(HTTP_STATUSES.BAD_REQUEST);
    });

    it("returns 400 for an Idempotency-Key with invalid characters", async () => {
      const res = await request(app)
        .post("/api/v1/groups/11111111-1111-4111-8111-111111111111/settlements")
        .set("Authorization", `Bearer ${signToken(ownerId)}`)
        .set("Idempotency-Key", "invalid key with spaces!!")
        .send(validCreateBody);

      expect(res.status).toBe(HTTP_STATUSES.BAD_REQUEST);
    });

    it("returns 400 for an over-long Idempotency-Key", async () => {
      const res = await request(app)
        .post("/api/v1/groups/11111111-1111-4111-8111-111111111111/settlements")
        .set("Authorization", `Bearer ${signToken(ownerId)}`)
        .set("Idempotency-Key", "k".repeat(129))
        .send(validCreateBody);

      expect(res.status).toBe(HTTP_STATUSES.BAD_REQUEST);
    });

    it("does not create anything when the Idempotency-Key is missing", async () => {
      const tx = makeTx();
      mockPrisma.$transaction.mockImplementation(runTransaction(tx));

      await request(app)
        .post("/api/v1/groups/11111111-1111-4111-8111-111111111111/settlements")
        .set("Authorization", `Bearer ${signToken(ownerId)}`)
        .send(validCreateBody);

      expect(tx.settlement.create).not.toHaveBeenCalled();
      expect(tx.idempotencyRecord.create).not.toHaveBeenCalled();
    });

    it("creates exactly one settlement on the first request", async () => {
      mockPrisma.group.findUnique.mockResolvedValue(group);
      mockPrisma.groupMember.findMany.mockResolvedValue(memberUsers());
      const tx = freshCreateTx();
      mockPrisma.$transaction.mockImplementation(runTransaction(tx));

      const res = await request(app)
        .post("/api/v1/groups/11111111-1111-4111-8111-111111111111/settlements")
        .set("Authorization", `Bearer ${signToken(ownerId)}`)
        .set("Idempotency-Key", idemKey)
        .send(validCreateBody);

      expect(res.status).toBe(HTTP_STATUSES.CREATED);
      expect(tx.settlement.create).toHaveBeenCalledTimes(1);
    });

    it("replays the original settlement when the same key and request are retried", async () => {
      mockPrisma.group.findUnique.mockResolvedValue(group);
      mockPrisma.groupMember.findMany.mockResolvedValue(memberUsers());
      const tx = freshCreateTx();
      mockPrisma.$transaction.mockImplementation(runTransaction(tx));
      tx.settlement.findUnique.mockResolvedValue(storedSettlement());

      tx.idempotencyRecord.findUnique.mockResolvedValueOnce(null).mockResolvedValue(
        idempotencyRecordRow(),
      );

      const first = await request(app)
        .post("/api/v1/groups/11111111-1111-4111-8111-111111111111/settlements")
        .set("Authorization", `Bearer ${signToken(ownerId)}`)
        .set("Idempotency-Key", idemKey)
        .send(validCreateBody);
      expect(first.status).toBe(HTTP_STATUSES.CREATED);
      expect(tx.settlement.create).toHaveBeenCalledTimes(1);

      const retry = await request(app)
        .post("/api/v1/groups/11111111-1111-4111-8111-111111111111/settlements")
        .set("Authorization", `Bearer ${signToken(ownerId)}`)
        .set("Idempotency-Key", idemKey)
        .send(validCreateBody);

      expect(retry.status).toBe(HTTP_STATUSES.CREATED);
      expect(retry.body.success).toBe(true);
      expect(retry.body.data.settlement.id).toBe("44444444-4444-4444-8444-444444444444");
      expect(retry.body.data.settlement.amountMinorUnits).toBe(500);
      expect(tx.settlement.create).toHaveBeenCalledTimes(1);
      expect(tx.settlement.findUnique).toHaveBeenCalledWith({
        where: { id: "44444444-4444-4444-8444-444444444444" },
        include: expect.anything(),
      });
      expect(JSON.stringify(retry.body)).not.toContain("requestHash");
      expect(JSON.stringify(retry.body)).not.toContain(idemKey);
    });

    it("rejects the same key reused with a different request payload", async () => {
      mockPrisma.group.findUnique.mockResolvedValue(group);
      mockPrisma.groupMember.findMany.mockResolvedValue(memberUsers());
      const tx = freshCreateTx();
      mockPrisma.$transaction.mockImplementation(runTransaction(tx));

      tx.idempotencyRecord.findUnique.mockResolvedValue(idempotencyRecordRow());

      const res = await request(app)
        .post("/api/v1/groups/11111111-1111-4111-8111-111111111111/settlements")
        .set("Authorization", `Bearer ${signToken(ownerId)}`)
        .set("Idempotency-Key", idemKey)
        .send({ ...validCreateBody, amountMinorUnits: 900 });

      expect(res.status).toBe(HTTP_STATUSES.CONFLICT);
      expect(tx.settlement.create).not.toHaveBeenCalled();
    });

    it("rejects a key already owned by a different user", async () => {
      mockPrisma.group.findUnique.mockResolvedValue(group);
      mockPrisma.groupMember.findMany.mockResolvedValue(memberUsers());
      const tx = freshCreateTx();
      mockPrisma.$transaction.mockImplementation(runTransaction(tx));

      tx.idempotencyRecord.findUnique.mockResolvedValue(
        idempotencyRecordRow({ userId: bobId }),
      );

      const res = await request(app)
        .post("/api/v1/groups/11111111-1111-4111-8111-111111111111/settlements")
        .set("Authorization", `Bearer ${signToken(ownerId)}`)
        .set("Idempotency-Key", idemKey)
        .send(validCreateBody);

      expect(res.status).toBe(HTTP_STATUSES.CONFLICT);
      expect(tx.settlement.create).not.toHaveBeenCalled();
    });

    it("does not allow a key to be reused across groups", async () => {
      mockPrisma.group.findUnique.mockResolvedValue(group);
      mockPrisma.groupMember.findMany.mockResolvedValue(memberUsers());
      const tx = freshCreateTx();
      mockPrisma.$transaction.mockImplementation(runTransaction(tx));

      tx.idempotencyRecord.findUnique.mockResolvedValue(idempotencyRecordRow());

      const res = await request(app)
        .post("/api/v1/groups/22222222-2222-4222-8222-222222222222/settlements")
        .set("Authorization", `Bearer ${signToken(ownerId)}`)
        .set("Idempotency-Key", idemKey)
        .send(validCreateBody);

      expect(res.status).toBe(HTTP_STATUSES.CONFLICT);
      expect(tx.settlement.create).not.toHaveBeenCalled();
    });

    it("allows a retry after a failed operation instead of blocking the key", async () => {
      mockPrisma.group.findUnique.mockResolvedValue(group);
      mockPrisma.groupMember.findMany.mockResolvedValue(memberUsers());
      const tx = makeTx();
      tx.idempotencyRecord.findUnique.mockResolvedValue(null);
      tx.idempotencyRecord.create.mockResolvedValue(idempotencyRecordRow({ status: "PENDING" }));
      tx.settlement.create
        .mockRejectedValueOnce(new Error("db boom"))
        .mockResolvedValue(storedSettlement());
      tx.idempotencyRecord.update.mockResolvedValue(idempotencyRecordRow());
      mockPrisma.$transaction.mockImplementation(runTransaction(tx));

      const failed = await request(app)
        .post("/api/v1/groups/11111111-1111-4111-8111-111111111111/settlements")
        .set("Authorization", `Bearer ${signToken(ownerId)}`)
        .set("Idempotency-Key", idemKey)
        .send(validCreateBody);

      expect(failed.status).toBe(HTTP_STATUSES.INTERNAL_SERVER_ERROR);
      expect(tx.idempotencyRecord.update).not.toHaveBeenCalled();

      const retry = await request(app)
        .post("/api/v1/groups/11111111-1111-4111-8111-111111111111/settlements")
        .set("Authorization", `Bearer ${signToken(ownerId)}`)
        .set("Idempotency-Key", idemKey)
        .send(validCreateBody);

      expect(retry.status).toBe(HTTP_STATUSES.CREATED);
      expect(retry.body.data.settlement.id).toBe("44444444-4444-4444-8444-444444444444");
      expect(tx.idempotencyRecord.update).toHaveBeenCalledTimes(1);
      expect(tx.idempotencyRecord.update).toHaveBeenCalledWith({
        where: { id: "idem-1" },
        data: { status: "COMPLETED", resourceId: "44444444-4444-4444-8444-444444444444" },
      });
    });

    it("creates only one settlement for two concurrent requests sharing a key", async () => {
      mockPrisma.group.findUnique.mockResolvedValue(group);
      mockPrisma.groupMember.findMany.mockResolvedValue(memberUsers());
      const tx = freshCreateTx();
      mockPrisma.$transaction.mockImplementation(runTransaction(tx));

      const first = await request(app)
        .post("/api/v1/groups/11111111-1111-4111-8111-111111111111/settlements")
        .set("Authorization", `Bearer ${signToken(ownerId)}`)
        .set("Idempotency-Key", idemKey)
        .send(validCreateBody);
      expect(first.status).toBe(HTTP_STATUSES.CREATED);
      expect(tx.settlement.create).toHaveBeenCalledTimes(1);

      const p2002 = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
        meta: { target: ["key"] },
      });
      mockPrisma.$transaction.mockImplementation(async () => {
        throw p2002;
      });
      mockPrisma.idempotencyRecord.findUnique.mockResolvedValue(idempotencyRecordRow());
      mockPrisma.settlement.findUnique.mockResolvedValue(storedSettlement());

      const second = await request(app)
        .post("/api/v1/groups/11111111-1111-4111-8111-111111111111/settlements")
        .set("Authorization", `Bearer ${signToken(ownerId)}`)
        .set("Idempotency-Key", idemKey)
        .send(validCreateBody);

      expect(second.status).toBe(HTTP_STATUSES.CREATED);
      expect(second.body.data.settlement.id).toBe("44444444-4444-4444-8444-444444444444");
      expect(tx.settlement.create).toHaveBeenCalledTimes(1);
    });
  });

  describe("GET /api/v1/groups/:id/settlements", () => {
    it("lists only the requested group's settlements for a member", async () => {
      mockPrisma.group.findUnique.mockResolvedValue(group);
      mockPrisma.groupMember.findMany.mockResolvedValue(memberUsers());
      mockPrisma.settlement.findMany.mockResolvedValue([storedSettlement()]);

      const res = await request(app)
        .get("/api/v1/groups/11111111-1111-4111-8111-111111111111/settlements")
        .set("Authorization", `Bearer ${signToken(aliceId)}`);

      expect(res.status).toBe(HTTP_STATUSES.OK);
      expect(res.body.success).toBe(true);
      expect(res.body.data.settlements).toHaveLength(1);
      expect(mockPrisma.settlement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { groupId: "11111111-1111-4111-8111-111111111111" } }),
      );
    });

    it("returns 401 without authentication", async () => {
      const res = await request(app).get("/api/v1/groups/11111111-1111-4111-8111-111111111111/settlements");
      expect(res.status).toBe(HTTP_STATUSES.UNAUTHORIZED);
    });

    it("returns 403 for a non-member", async () => {
      mockPrisma.group.findUnique.mockResolvedValue(group);
      mockPrisma.groupMember.findMany.mockResolvedValue(memberUsers());

      const res = await request(app)
        .get("/api/v1/groups/11111111-1111-4111-8111-111111111111/settlements")
        .set("Authorization", `Bearer ${signToken(outsiderId)}`);

      expect(res.status).toBe(HTTP_STATUSES.FORBIDDEN);
    });

    it("returns 404 when the group does not exist", async () => {
      mockPrisma.group.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .get("/api/v1/groups/00000000-0000-4000-8000-000000000099/settlements")
        .set("Authorization", `Bearer ${signToken(aliceId)}`);

      expect(res.status).toBe(HTTP_STATUSES.NOT_FOUND);
    });
  });

  describe("GET /api/v1/settlements/:id", () => {
    it("returns a settlement for a member of its group", async () => {
      mockPrisma.settlement.findUnique.mockResolvedValue(storedSettlement());
      mockPrisma.groupMember.findMany.mockResolvedValue(memberUsers());

      const res = await request(app)
        .get("/api/v1/settlements/44444444-4444-4444-8444-444444444444")
        .set("Authorization", `Bearer ${signToken(aliceId)}`);

      expect(res.status).toBe(HTTP_STATUSES.OK);
      expect(res.body.success).toBe(true);
      expect(res.body.data.settlement.id).toBe("44444444-4444-4444-8444-444444444444");
      expect(res.body.data.settlement.amountMinorUnits).toBe(500);
    });

    it("returns 401 without authentication", async () => {
      const res = await request(app).get("/api/v1/settlements/44444444-4444-4444-8444-444444444444");
      expect(res.status).toBe(HTTP_STATUSES.UNAUTHORIZED);
    });

    it("returns 403 for a non-member (IDOR)", async () => {
      mockPrisma.settlement.findUnique.mockResolvedValue(storedSettlement());
      mockPrisma.groupMember.findMany.mockResolvedValue(memberIdsOnly());

      const res = await request(app)
        .get("/api/v1/settlements/44444444-4444-4444-8444-444444444444")
        .set("Authorization", `Bearer ${signToken(outsiderId)}`);

      expect(res.status).toBe(HTTP_STATUSES.FORBIDDEN);
    });

    it("returns 404 when the settlement does not exist", async () => {
      mockPrisma.settlement.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .get("/api/v1/settlements/00000000-0000-4000-8000-000000000099")
        .set("Authorization", `Bearer ${signToken(aliceId)}`);

      expect(res.status).toBe(HTTP_STATUSES.NOT_FOUND);
    });

    it("does not expose sensitive user fields", async () => {
      mockPrisma.settlement.findUnique.mockResolvedValue(storedSettlement());
      mockPrisma.groupMember.findMany.mockResolvedValue(memberUsers());

      const res = await request(app)
        .get("/api/v1/settlements/44444444-4444-4444-8444-444444444444")
        .set("Authorization", `Bearer ${signToken(aliceId)}`);

      expect(res.status).toBe(HTTP_STATUSES.OK);
      expect(JSON.stringify(res.body)).not.toContain("passwordHash");
      expect(JSON.stringify(res.body)).not.toContain("password");
    });
  });
});