import { describe, it, expect, beforeEach, vi } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("../src/db/prisma.js", async () => {
  return {
    prisma: {
      $transaction: vi.fn(),
      idempotencyRecord: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        deleteMany: vi.fn(),
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
import {
  SettlementRepository,
  type SettlementCreateData,
} from "../src/modules/settlements/settlement.repository.js";
import type { IdempotencyContext } from "../src/modules/idempotency/reconcile.js";
import { APP_ERRORS } from "../src/constants/app-errors.js";
import { HTTP_STATUSES } from "../src/constants/http-statuses.js";

const mockPrisma = vi.mocked(prisma);

const createData: SettlementCreateData = {
  groupId: "group-1",
  payerId: "bob-1",
  payeeId: "alice-1",
  amountMinorUnits: 500n,
  currencyCode: "PKR",
  settledAt: new Date("2026-01-01T00:00:00Z"),
};

const idempotency: IdempotencyContext = {
  key: "key-12345678",
  userId: "alice-1",
  requestHash: "hash-of-request-a",
};

const activity = {
  userId: "alice-1",
  type: "SETTLEMENT_ADDED" as const,
  message: "recorded a settlement",
};

function storedSettlement(overrides: Record<string, unknown> = {}) {
  return {
    id: "settlement-1",
    groupId: "group-1",
    payerId: "bob-1",
    payeeId: "alice-1",
    amountMinorUnits: 500n,
    currencyCode: "PKR",
    settledAt: new Date("2026-01-01T00:00:00Z"),
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    payer: { id: "bob-1", name: "Bob", email: "bob@example.com" },
    payee: { id: "alice-1", name: "Alice", email: "alice@example.com" },
    ...overrides,
  };
}

function idempotencyRecordRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "idem-1",
    key: "key-12345678",
    userId: "alice-1",
    requestHash: "hash-of-request-a",
    status: "COMPLETED",
    operation: "SETTLEMENT_CREATE",
    scope: "group-1",
    resourceId: "settlement-1",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    expiresAt: new Date(Date.now() + 60_000),
    ...overrides,
  };
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

function runTransaction<T>(tx: T) {
  return async (callback: (t: T) => Promise<unknown>): Promise<unknown> => callback(tx);
}

function makeRepository(): SettlementRepository {
  return new SettlementRepository();
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SettlementRepository.createSettlement (idempotent)", () => {
  it("claims the idempotency key and creates the settlement in one transaction", async () => {
    const tx = makeTx();
    tx.idempotencyRecord.findUnique.mockResolvedValue(null);
    tx.idempotencyRecord.create.mockResolvedValue(idempotencyRecordRow({ status: "PENDING" }));
    tx.settlement.create.mockResolvedValue(storedSettlement());
    tx.idempotencyRecord.update.mockResolvedValue(idempotencyRecordRow());
    mockPrisma.$transaction.mockImplementation(runTransaction(tx));

    const repository = makeRepository();
    const result = await repository.createSettlement(createData, idempotency, activity);

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.idempotencyRecord.findUnique).toHaveBeenCalledWith({
      where: { key: "key-12345678" },
    });
    expect(tx.idempotencyRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        key: "key-12345678",
        userId: "alice-1",
        requestHash: "hash-of-request-a",
        status: "PENDING",
        operation: "SETTLEMENT_CREATE",
        scope: "group-1",
        expiresAt: expect.any(Date),
      }),
    });
    expect(tx.settlement.create).toHaveBeenCalledTimes(1);
    expect(tx.idempotencyRecord.update).toHaveBeenCalledWith({
      where: { id: "idem-1" },
      data: { status: "COMPLETED", resourceId: "settlement-1" },
    });
    expect(result.id).toBe("settlement-1");
  });

  it("replays the stored settlement when the same key and request is retried", async () => {
    const tx = makeTx();
    tx.idempotencyRecord.findUnique.mockResolvedValue(idempotencyRecordRow());
    tx.settlement.findUnique.mockResolvedValue(storedSettlement());
    mockPrisma.$transaction.mockImplementation(runTransaction(tx));

    const repository = makeRepository();
    const result = await repository.createSettlement(createData, idempotency, activity);

    expect(tx.settlement.create).not.toHaveBeenCalled();
    expect(tx.settlement.findUnique).toHaveBeenCalledWith({
      where: { id: "settlement-1" },
      include: expect.anything(),
    });
    expect(result.id).toBe("settlement-1");
  });

  it("rejects a retry that uses the same key with a different payload", async () => {
    const tx = makeTx();
    tx.idempotencyRecord.findUnique.mockResolvedValue(
      idempotencyRecordRow({ requestHash: "hash-of-request-b" }),
    );
    mockPrisma.$transaction.mockImplementation(runTransaction(tx));

    const repository = makeRepository();
    await expect(
      repository.createSettlement(createData, idempotency, activity),
    ).rejects.toMatchObject({
      code: APP_ERRORS.IDEMPOTENCY_KEY_REUSED,
      statusCode: HTTP_STATUSES.CONFLICT,
    });
    expect(tx.settlement.create).not.toHaveBeenCalled();
  });

  it("rejects a key already owned by a different user", async () => {
    const tx = makeTx();
    tx.idempotencyRecord.findUnique.mockResolvedValue(idempotencyRecordRow({ userId: "owner-1" }));
    mockPrisma.$transaction.mockImplementation(runTransaction(tx));

    const repository = makeRepository();
    await expect(
      repository.createSettlement(createData, idempotency, activity),
    ).rejects.toMatchObject({
      code: APP_ERRORS.IDEMPOTENCY_KEY_REUSED,
      statusCode: HTTP_STATUSES.CONFLICT,
    });
    expect(tx.settlement.create).not.toHaveBeenCalled();
  });

  it("rejects a retry while the original request is still in progress", async () => {
    const tx = makeTx();
    tx.idempotencyRecord.findUnique.mockResolvedValue(idempotencyRecordRow({ status: "PENDING" }));
    mockPrisma.$transaction.mockImplementation(runTransaction(tx));

    const repository = makeRepository();
    await expect(
      repository.createSettlement(createData, idempotency, activity),
    ).rejects.toMatchObject({
      code: APP_ERRORS.IDEMPOTENCY_CONFLICT,
      statusCode: HTTP_STATUSES.CONFLICT,
    });
    expect(tx.settlement.create).not.toHaveBeenCalled();
  });

  it("reclaims an expired key and processes the request as new", async () => {
    const tx = makeTx();
    tx.idempotencyRecord.findUnique.mockResolvedValue(
      idempotencyRecordRow({ expiresAt: new Date(Date.now() - 1000) }),
    );
    tx.idempotencyRecord.deleteMany.mockResolvedValue({ count: 1 });
    tx.idempotencyRecord.create.mockResolvedValue(idempotencyRecordRow({ status: "PENDING" }));
    tx.settlement.create.mockResolvedValue(storedSettlement());
    tx.idempotencyRecord.update.mockResolvedValue(idempotencyRecordRow());
    mockPrisma.$transaction.mockImplementation(runTransaction(tx));

    const repository = makeRepository();
    const result = await repository.createSettlement(createData, idempotency, activity);

    expect(tx.idempotencyRecord.deleteMany).toHaveBeenCalledWith({
      where: { id: "idem-1" },
    });
    expect(tx.settlement.create).toHaveBeenCalledTimes(1);
    expect(result.id).toBe("settlement-1");
  });

  it("replays the winner's result when a concurrent request loses the unique-key race", async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "test",
      meta: { target: ["key"] },
    });
    mockPrisma.$transaction.mockRejectedValue(p2002);
    mockPrisma.idempotencyRecord.findUnique.mockResolvedValue(idempotencyRecordRow());
    mockPrisma.settlement.findUnique.mockResolvedValue(storedSettlement());

    const repository = makeRepository();
    const result = await repository.createSettlement(createData, idempotency, activity);

    expect(mockPrisma.settlement.create).not.toHaveBeenCalled();
    expect(mockPrisma.settlement.findUnique).toHaveBeenCalledWith({
      where: { id: "settlement-1" },
      include: expect.anything(),
    });
    expect(result.id).toBe("settlement-1");
  });

  it("propagates a failed settlement write without completing the idempotency record", async () => {
    const tx = makeTx();
    tx.idempotencyRecord.findUnique.mockResolvedValue(null);
    tx.idempotencyRecord.create.mockResolvedValue(idempotencyRecordRow({ status: "PENDING" }));
    tx.settlement.create.mockRejectedValue(new Error("db boom"));
    mockPrisma.$transaction.mockImplementation(runTransaction(tx));

    const repository = makeRepository();
    await expect(repository.createSettlement(createData, idempotency, activity)).rejects.toThrow(
      "db boom",
    );
    expect(tx.idempotencyRecord.update).not.toHaveBeenCalled();
  });
});
