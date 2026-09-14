import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/db/prisma.js", async () => {
  return {
    prisma: {
      $transaction: vi.fn(),
      group: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      groupMember: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        delete: vi.fn(),
      },
      user: {
        findUnique: vi.fn(),
      },
      expense: {
        create: vi.fn(),
      },
      settlement: {
        create: vi.fn(),
      },
      activityEvent: {
        create: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
      },
    },
  };
});

import { prisma } from "../src/db/prisma.js";
import { GroupRepository } from "../src/modules/groups/group.repository.js";
import { ExpenseRepository } from "../src/modules/expenses/expense.repository.js";
import { SettlementRepository } from "../src/modules/settlements/settlement.repository.js";

const mockPrisma = vi.mocked(prisma);

const group = {
  id: "group-1",
  name: "Trip to Naran",
  createdById: "owner-1",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

const membership = {
  id: "membership-1",
  groupId: "group-1",
  userId: "member-1",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

const storedExpense = {
  id: "expense-1",
  groupId: "group-1",
  paidById: "payer-1",
  description: "Dinner",
  amountMinorUnits: 5000n,
  currencyCode: "PKR",
  splitType: "EQUAL",
  expenseDate: new Date("2026-01-01T00:00:00Z"),
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
  payer: { id: "payer-1", name: "Payer", email: "payer@example.com" },
  splits: [],
};

const storedSettlement = {
  id: "settlement-1",
  groupId: "group-1",
  payerId: "bob",
  payeeId: "alice",
  amountMinorUnits: 500n,
  currencyCode: "PKR",
  settledAt: new Date("2026-01-01T00:00:00Z"),
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
  payer: { id: "bob", name: "Bob", email: "bob@example.com" },
  payee: { id: "alice", name: "Alice", email: "alice@example.com" },
};

interface TxStub {
  group: { create: ReturnType<typeof vi.fn> };
  groupMember: { create: ReturnType<typeof vi.fn> };
  expense: { create: ReturnType<typeof vi.fn> };
  settlement: { create: ReturnType<typeof vi.fn> };
  activityEvent: { create: ReturnType<typeof vi.fn> };
  idempotencyRecord: {
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
  };
}

function makeTx(): TxStub {
  return {
    group: { create: vi.fn().mockResolvedValue(group) },
    groupMember: { create: vi.fn().mockResolvedValue(membership) },
    expense: { create: vi.fn().mockResolvedValue(storedExpense) },
    settlement: { create: vi.fn().mockResolvedValue(storedSettlement) },
    activityEvent: { create: vi.fn().mockResolvedValue({ id: "event-1" }) },
    idempotencyRecord: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "idem-1", status: "PENDING" }),
      update: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
}

function runTransaction<T>(tx: TxStub): (callback: (t: TxStub) => Promise<T>) => Promise<T> {
  return async (callback: (t: TxStub) => Promise<T>) => callback(tx);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Group activity transaction consistency", () => {
  it("creates the group, its membership, and the activity event in one transaction", async () => {
    const tx = makeTx();
    mockPrisma.$transaction.mockImplementation(runTransaction(tx));

    const repository = new GroupRepository();
    const result = await repository.createGroupWithOwner(
      "owner-1",
      { name: "Trip to Naran" },
      {
        userId: "owner-1",
        type: "GROUP_CREATED",
        message: "created the group",
      },
    );

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.group.create).toHaveBeenCalledTimes(1);
    expect(tx.groupMember.create).toHaveBeenCalledTimes(1);
    expect(tx.activityEvent.create).toHaveBeenCalledTimes(1);
    expect(tx.activityEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          groupId: "group-1",
          userId: "owner-1",
          type: "GROUP_CREATED",
          message: "created the group",
          amountMinorUnits: null,
          currencyCode: null,
          occurredAt: group.createdAt,
        }),
      }),
    );
    expect(result.id).toBe("group-1");
  });

  it("records a MEMBER_ADDED event in the same transaction as the membership write", async () => {
    const tx = makeTx();
    mockPrisma.$transaction.mockImplementation(runTransaction(tx));

    const repository = new GroupRepository();
    await repository.addGroupMember("group-1", "member-1", {
      userId: "owner-1",
      type: "MEMBER_ADDED",
      message: "added Sana to the group",
    });

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.groupMember.create).toHaveBeenCalledWith({
      data: { groupId: "group-1", userId: "member-1" },
    });
    expect(tx.activityEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          groupId: "group-1",
          userId: "owner-1",
          type: "MEMBER_ADDED",
        }),
      }),
    );
  });

  it("rejects the whole operation when activity creation fails so no partial group persists", async () => {
    const tx = makeTx();
    tx.activityEvent.create.mockRejectedValue(new Error("boom"));
    mockPrisma.$transaction.mockImplementation(runTransaction(tx));

    const repository = new GroupRepository();
    await expect(
      repository.createGroupWithOwner(
        "owner-1",
        { name: "Trip to Naran" },
        {
          userId: "owner-1",
          type: "GROUP_CREATED",
          message: "created the group",
        },
      ),
    ).rejects.toThrow("boom");
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });
});

describe("Expense activity transaction consistency", () => {
  const activity = {
    userId: "owner-1",
    type: "EXPENSE_ADDED" as const,
    message: 'added the expense "Dinner"',
  };

  it("creates the expense and its activity event in one transaction with matching amounts", async () => {
    const tx = makeTx();
    mockPrisma.$transaction.mockImplementation(runTransaction(tx));

    const repository = new ExpenseRepository();
    const result = await repository.createExpenseWithSplits(
      {
        groupId: "group-1",
        paidById: "payer-1",
        description: "Dinner",
        amountMinorUnits: 5000n,
        currencyCode: "PKR",
        splitType: "EQUAL",
        expenseDate: new Date("2026-01-01T00:00:00Z"),
        splits: [{ userId: "payer-1", amountMinorUnits: 5000n }],
      },
      activity,
    );

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.expense.create).toHaveBeenCalledTimes(1);
    expect(tx.activityEvent.create).toHaveBeenCalledTimes(1);
    expect(tx.activityEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          groupId: "group-1",
          userId: "owner-1",
          type: "EXPENSE_ADDED",
          amountMinorUnits: 5000n,
          currencyCode: "PKR",
          occurredAt: storedExpense.createdAt,
        }),
      }),
    );
    expect(result.id).toBe("expense-1");
  });

  it("does not create the activity event when the expense write fails (transaction rejects)", async () => {
    const tx = makeTx();
    tx.expense.create.mockRejectedValue(new Error("db boom"));
    mockPrisma.$transaction.mockImplementation(runTransaction(tx));

    const repository = new ExpenseRepository();
    await expect(
      repository.createExpenseWithSplits(
        {
          groupId: "group-1",
          paidById: "payer-1",
          description: "Dinner",
          amountMinorUnits: 5000n,
          currencyCode: "PKR",
          splitType: "EQUAL",
          expenseDate: new Date("2026-01-01T00:00:00Z"),
          splits: [{ userId: "payer-1", amountMinorUnits: 5000n }],
        },
        activity,
      ),
    ).rejects.toThrow("db boom");
    expect(tx.activityEvent.create).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("rejects the operation when the activity event write fails", async () => {
    const tx = makeTx();
    tx.activityEvent.create.mockRejectedValue(new Error("activity boom"));
    mockPrisma.$transaction.mockImplementation(runTransaction(tx));

    const repository = new ExpenseRepository();
    await expect(
      repository.createExpenseWithSplits(
        {
          groupId: "group-1",
          paidById: "payer-1",
          description: "Dinner",
          amountMinorUnits: 5000n,
          currencyCode: "PKR",
          splitType: "EQUAL",
          expenseDate: new Date("2026-01-01T00:00:00Z"),
          splits: [{ userId: "payer-1", amountMinorUnits: 5000n }],
        },
        activity,
      ),
    ).rejects.toThrow("activity boom");
  });
});

describe("Settlement activity transaction consistency", () => {
  it("creates the settlement and its activity event in one transaction with matching amounts", async () => {
    const tx = makeTx();
    mockPrisma.$transaction.mockImplementation(runTransaction(tx));

    const repository = new SettlementRepository();
    const result = await repository.createSettlement(
      {
        groupId: "group-1",
        payerId: "bob",
        payeeId: "alice",
        amountMinorUnits: 500n,
        currencyCode: "PKR",
        settledAt: new Date("2026-01-01T00:00:00Z"),
      },
      {
        key: "key-12345678",
        userId: "owner-1",
        requestHash: "hash-of-request",
      },
      {
        userId: "owner-1",
        type: "SETTLEMENT_ADDED",
        message: "recorded a settlement",
      },
    );

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.settlement.create).toHaveBeenCalledTimes(1);
    expect(tx.activityEvent.create).toHaveBeenCalledTimes(1);
    expect(tx.activityEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          groupId: "group-1",
          userId: "owner-1",
          type: "SETTLEMENT_ADDED",
          amountMinorUnits: 500n,
          currencyCode: "PKR",
          occurredAt: storedSettlement.createdAt,
        }),
      }),
    );
    expect(result.id).toBe("settlement-1");
  });

  it("rejects the operation when the activity event write fails", async () => {
    const tx = makeTx();
    tx.activityEvent.create.mockRejectedValue(new Error("boom"));
    mockPrisma.$transaction.mockImplementation(runTransaction(tx));

    const repository = new SettlementRepository();
    await expect(
      repository.createSettlement(
        {
          groupId: "group-1",
          payerId: "bob",
          payeeId: "alice",
          amountMinorUnits: 500n,
          currencyCode: "PKR",
          settledAt: new Date("2026-01-01T00:00:00Z"),
        },
        {
          key: "key-12345678",
          userId: "owner-1",
          requestHash: "hash-of-request",
        },
        {
          userId: "owner-1",
          type: "SETTLEMENT_ADDED",
          message: "recorded a settlement",
        },
      ),
    ).rejects.toThrow("boom");
  });
});
