import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AuthRepository } from "../../src/modules/auth/auth.repository.js";
import { ExpenseRepository } from "../../src/modules/expenses/expense.repository.js";
import { GroupRepository } from "../../src/modules/groups/group.repository.js";
import { SettlementRepository } from "../../src/modules/settlements/settlement.repository.js";
import { calculateBalances } from "../../src/modules/settlements/balance.util.js";
import {
  connectDatabase,
  disconnectDatabase,
  isDatabaseReachable,
  prisma,
} from "../../src/db/prisma.js";
import { ALL_TABLES, canRunIntegrationTests, TEST_DATABASE_URL } from "./helpers.js";

describe.skipIf(!canRunIntegrationTests)("PostgreSQL integration tests", () => {
  const authRepository = new AuthRepository();
  const groupRepository = new GroupRepository();
  const expenseRepository = new ExpenseRepository();
  const settlementRepository = new SettlementRepository();

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL!;
    await connectDatabase();
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE ${ALL_TABLES.map((table) => `"${table}"`).join(", ")} RESTART IDENTITY CASCADE`,
    );
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  it("connects to PostgreSQL and answers a health query", async () => {
    await expect(prisma.$queryRaw`SELECT 1`).resolves.toBeDefined();
    await expect(isDatabaseReachable()).resolves.toBe(true);
  });

  it("enforces the unique email constraint on users", async () => {
    await authRepository.create({
      name: "Ahmed",
      email: "ahmed@example.com",
      passwordHash: "hash-1",
    });

    await expect(
      authRepository.create({
        name: "Ahmed 2",
        email: "ahmed@example.com",
        passwordHash: "hash-2",
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("creates a group with its owner membership atomically", async () => {
    const ahmed = await authRepository.create({
      name: "Ahmed",
      email: "owner@example.com",
      passwordHash: "hash-1",
    });

    const group = await groupRepository.createGroupWithOwner(
      ahmed.id,
      { name: "Trip" },
      { userId: ahmed.id, type: "GROUP_CREATED", message: "created the group" },
    );

    expect(await groupRepository.isGroupMember(group.id, ahmed.id)).toBe(true);

    const withMembers = await groupRepository.findGroupByIdWithMembers(group.id);
    expect(withMembers?.members.map((member) => member.id)).toEqual([ahmed.id]);

    expect(await prisma.activityEvent.count({ where: { groupId: group.id } })).toBe(1);
  });

  it("creates an expense with splits and an activity event in one transaction", async () => {
    const ahmed = await authRepository.create({
      name: "Ahmed",
      email: "payer@example.com",
      passwordHash: "hash-1",
    });
    const sana = await authRepository.create({
      name: "Sana",
      email: "split@example.com",
      passwordHash: "hash-1",
    });

    const group = await groupRepository.createGroupWithOwner(
      ahmed.id,
      { name: "Dinner Club" },
      { userId: ahmed.id, type: "GROUP_CREATED", message: "created the group" },
    );
    await groupRepository.addGroupMember(group.id, sana.id, {
      userId: ahmed.id,
      type: "MEMBER_ADDED",
      message: "added Sana",
    });

    const expense = await expenseRepository.createExpenseWithSplits(
      {
        groupId: group.id,
        paidById: ahmed.id,
        description: "Dinner",
        amountMinorUnits: 200n,
        currencyCode: "PKR",
        splitType: "EQUAL",
        expenseDate: new Date("2026-01-15T18:30:00.000Z"),
        splits: [
          { userId: ahmed.id, amountMinorUnits: 100n },
          { userId: sana.id, amountMinorUnits: 100n },
        ],
      },
      { userId: ahmed.id, type: "EXPENSE_ADDED", message: 'added the expense "Dinner"' },
    );

    const stored = await prisma.expense.findUnique({
      where: { id: expense.id },
      include: { splits: true },
    });

    expect(stored?.amountMinorUnits).toBe(200n);
    expect(stored?.splits).toHaveLength(2);
    expect(await prisma.activityEvent.count({ where: { groupId: group.id } })).toBe(3);
  });

  it("rolls the whole expense transaction back when a split violates a foreign key", async () => {
    const ahmed = await authRepository.create({
      name: "Ahmed",
      email: "rollback@example.com",
      passwordHash: "hash-1",
    });

    const group = await groupRepository.createGroupWithOwner(
      ahmed.id,
      { name: "Broken Split" },
      { userId: ahmed.id, type: "GROUP_CREATED", message: "created the group" },
    );

    await expect(
      expenseRepository.createExpenseWithSplits(
        {
          groupId: group.id,
          paidById: ahmed.id,
          description: "Broken",
          amountMinorUnits: 100n,
          currencyCode: "PKR",
          splitType: "EXACT",
          expenseDate: new Date(),
          splits: [{ userId: "no-such-user", amountMinorUnits: 100n }],
        },
        { userId: ahmed.id, type: "EXPENSE_ADDED", message: "must be rolled back" },
      ),
    ).rejects.toMatchObject({ code: "P2003" });

    expect(await prisma.expense.count()).toBe(0);
    expect(await prisma.expenseSplit.count()).toBe(0);
    expect(await prisma.activityEvent.count()).toBe(1);
  });

  it("replays a completed settlement for the same idempotency key and rejects a different request body", async () => {
    const ahmed = await authRepository.create({
      name: "Ahmed",
      email: "replay-owner@example.com",
      passwordHash: "hash-1",
    });
    const sana = await authRepository.create({
      name: "Sana",
      email: "replay-payer@example.com",
      passwordHash: "hash-1",
    });

    const group = await groupRepository.createGroupWithOwner(
      ahmed.id,
      { name: "Settlement Group" },
      { userId: ahmed.id, type: "GROUP_CREATED", message: "created the group" },
    );
    await groupRepository.addGroupMember(group.id, sana.id, {
      userId: ahmed.id,
      type: "MEMBER_ADDED",
      message: "added Sana",
    });

    const context = {
      key: "itest-settlement-replay-key",
      userId: ahmed.id,
      requestHash: "hash-of-request-a",
    };
    const settlementData = {
      groupId: group.id,
      payerId: sana.id,
      payeeId: ahmed.id,
      amountMinorUnits: 50n,
      currencyCode: "PKR",
      settledAt: new Date("2026-01-17T12:00:00.000Z"),
    };
    const activity = {
      userId: ahmed.id,
      type: "SETTLEMENT_ADDED" as const,
      message: "recorded a settlement",
    };

    const first = await settlementRepository.createSettlement(settlementData, context, activity);
    const replayed = await settlementRepository.createSettlement(settlementData, context, activity);

    expect(replayed.id).toBe(first.id);
    expect(await prisma.settlement.count({ where: { groupId: group.id } })).toBe(1);

    await expect(
      settlementRepository.createSettlement(
        settlementData,
        { ...context, requestHash: "hash-of-request-b" },
        activity,
      ),
    ).rejects.toMatchObject({ name: "ConflictError" });

    expect(await prisma.settlement.count({ where: { groupId: group.id } })).toBe(1);
  });

  it("derives group balances from real expenses and settlements", async () => {
    const ahmed = await authRepository.create({
      name: "Ahmed",
      email: "balance-owner@example.com",
      passwordHash: "hash-1",
    });
    const sana = await authRepository.create({
      name: "Sana",
      email: "balance-payer@example.com",
      passwordHash: "hash-1",
    });

    const group = await groupRepository.createGroupWithOwner(
      ahmed.id,
      { name: "Balance Group" },
      { userId: ahmed.id, type: "GROUP_CREATED", message: "created the group" },
    );
    await groupRepository.addGroupMember(group.id, sana.id, {
      userId: ahmed.id,
      type: "MEMBER_ADDED",
      message: "added Sana",
    });

    await expenseRepository.createExpenseWithSplits(
      {
        groupId: group.id,
        paidById: ahmed.id,
        description: "Dinner",
        amountMinorUnits: 200n,
        currencyCode: "PKR",
        splitType: "EQUAL",
        expenseDate: new Date("2026-01-15T18:30:00.000Z"),
        splits: [
          { userId: ahmed.id, amountMinorUnits: 100n },
          { userId: sana.id, amountMinorUnits: 100n },
        ],
      },
      { userId: ahmed.id, type: "EXPENSE_ADDED", message: 'added the expense "Dinner"' },
    );

    await settlementRepository.createSettlement(
      {
        groupId: group.id,
        payerId: sana.id,
        payeeId: ahmed.id,
        amountMinorUnits: 50n,
        currencyCode: "PKR",
        settledAt: new Date("2026-01-17T12:00:00.000Z"),
      },
      { key: "itest-balance-key", userId: ahmed.id, requestHash: "hash-of-balance-request" },
      { userId: ahmed.id, type: "SETTLEMENT_ADDED", message: "recorded a settlement" },
    );

    const expenses = await settlementRepository.findExpensesForBalances(group.id);
    const settlements = await settlementRepository.findSettlementsForBalances(group.id);
    const balances = calculateBalances(expenses, settlements);

    expect(balances.get(ahmed.id)).toBe(50n);
    expect(balances.get(sana.id)).toBe(-50n);
  });
});
