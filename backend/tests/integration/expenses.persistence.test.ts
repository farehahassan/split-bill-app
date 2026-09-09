import { describe, expect, it } from "vitest";

import { prisma } from "../../src/db/prisma.js";
import { ExpenseRepository } from "../../src/modules/expenses/expense.repository.js";
import { ExpenseService } from "../../src/modules/expenses/expense.service.js";
import {
  addTestMember,
  createTestGroup,
  createTestUser,
} from "./helpers/fixtures.js";

const repository = new ExpenseRepository();
const service = new ExpenseService(repository);

describe("expense persistence (PostgreSQL)", () => {
  it("createExpenseWithSplits persists the expense, splits, and EXPENSE_ADDED activity atomically", async () => {
    const payer = await createTestUser();
    const member = await createTestUser();
    const group = await createTestGroup(payer.id, { name: "Dinner" });
    await addTestMember(group.id, member.id);

    const expense = await service.createExpense(payer.id, {
      groupId: group.id,
      description: "Sushi",
      amountMinorUnits: 3000,
      payerId: payer.id,
      splitType: "EXACT",
      participants: [
        { userId: payer.id, amountMinorUnits: 500 },
        { userId: member.id, amountMinorUnits: 2500 },
      ],
    });

    const row = await prisma.expense.findUnique({ where: { id: expense.id } });
    expect(row).not.toBeNull();
    expect(row!.description).toBe("Sushi");
    expect(row!.amountMinorUnits).toBe(3000n);
    expect(row!.currencyCode).toBe("PKR");

    const splits = await prisma.expenseSplit.findMany({
      where: { expenseId: expense.id },
      orderBy: { amountMinorUnits: "asc" },
    });
    expect(splits).toHaveLength(2);
    expect(splits.map((s) => s.amountMinorUnits).sort((a, b) => (a < b ? -1 : 1))).toEqual([
      500n,
      2500n,
    ]);

    const activity = await prisma.activityEvent.findMany({
      where: { groupId: group.id, type: "EXPENSE_ADDED" },
    });
    expect(activity).toHaveLength(1);
    expect(activity[0]!.amountMinorUnits).toBe(3000n);
  });

  it("EQUAL splits distribute the total losslessly over the participants", async () => {
    const payer = await createTestUser();
    const member = await createTestUser();
    const group = await createTestGroup(payer.id);
    await addTestMember(group.id, member.id);
    const total = 10000n;

    const expense = await service.createExpense(payer.id, {
      groupId: group.id,
      description: "Hotel",
      amountMinorUnits: Number(total),
      payerId: payer.id,
      splitType: "EQUAL",
      participants: [
        { userId: payer.id },
        { userId: member.id },],
    });

    const splits = await prisma.expenseSplit.findMany({ where: { expenseId: expense.id } });
    const sum = splits.reduce((acc, split) => acc + split.amountMinorUnits, 0n);
    expect(sum).toBe(total); // exactness — no floating point, no remainder
  });

  it("updateExpenseWithSplits replaces the split set atomically", async () => {
    const payer = await createTestUser();
    const memberA = await createTestUser();
    const memberB = await createTestUser();
    const group = await createTestGroup(payer.id);
    await addTestMember(group.id, memberA.id);
    await addTestMember(group.id, memberB.id);

    const expense = await service.createExpense(payer.id, {
      groupId: group.id,
      description: "Dojo",
      amountMinorUnits: 6000,
      payerId: payer.id,
      splitType: "EQUAL",
      participants: [
        { userId: payer.id },
        { userId: memberA.id },
        { userId: memberB.id },],
    });

    const updated = await service.updateExpense(payer.id, expense.id, {
      amountMinorUnits: 4000,
      participants: [
        { userId: payer.id },
        { userId: memberB.id },],
    });

    const splits = await prisma.expenseSplit.findMany({ where: { expenseId: expense.id } });
    expect(splits).toHaveLength(2);
    expect(splits.map((s) => s.userId).sort()).toEqual([payer.id, memberB.id].sort());
    expect(splits.reduce((acc, s) => acc + s.amountMinorUnits, 0n)).toBe(4000n);
    expect((await prisma.expense.findUnique({ where: { id: expense.id } }))!.amountMinorUnits).toBe(
      4000n,
    );
    expect(updated.splits).toHaveLength(2);
    expect(
      (await prisma.activityEvent.count({ where: { groupId: group.id, type: "EXPENSE_UPDATED" } })),
    ).toBe(1);
  });

  it("deleteExpenseWithEvent removes the expense, cascades its splits, and records EXPENSE_DELETED", async () => {
    const payer = await createTestUser();
    const member = await createTestUser();
    const group = await createTestGroup(payer.id);
    await addTestMember(group.id, member.id);

    const expense = await service.createExpense(payer.id, {
      groupId: group.id,
      description: "Groceries",
      amountMinorUnits: 800,
      payerId: payer.id,
      splitType: "EQUAL",
      participants: [{ userId: payer.id }, { userId: member.id }],
    });

    await service.deleteExpense(payer.id, expense.id);

    expect(await prisma.expense.findUnique({ where: { id: expense.id } })).toBeNull();
    expect(
      (await prisma.expenseSplit.count({ where: { expenseId: expense.id } })),
    ).toBe(0);

    const activity = await prisma.activityEvent.findMany({
      where: { groupId: group.id },
      orderBy: { createdAt: "asc" },
    });
    expect(activity.map((a) => a.type)).toEqual(["EXPENSE_ADDED", "EXPENSE_DELETED"]);
    expect(activity[1]!.amountMinorUnits).toBe(800n);
  });

  it("stores money losslessly as BIGINT minor units through the whole round trip", async () => {
    const payer = await createTestUser();
    const group = await createTestGroup(payer.id);
    const largeAmount = 12_345_678_912_345n; // ~123 billion paisa — far beyond 32-bit

    const expense = await repository.createExpenseWithSplits(
      {
        groupId: group.id,
        paidById: payer.id,
        description: "Megabadget",
        amountMinorUnits: largeAmount,
        currencyCode: "PKR",
        splitType: "EQUAL",
        expenseDate: new Date(),
        splits: [{ userId: payer.id, amountMinorUnits: largeAmount }],
      },
      { userId: payer.id, type: "EXPENSE_ADDED", message: "added the expense" },
    );

    const row = await prisma.expense.findUnique({ where: { id: expense.id } });
    expect(row!.amountMinorUnits).toBe(largeAmount);
    expect(
      (await prisma.expenseSplit.findFirst({ where: { expenseId: expense.id } }))!
        .amountMinorUnits,
    ).toBe(largeAmount);
  });

  it("non-members cannot create expenses in a group", async () => {
    const owner = await createTestUser();
    const outsider = await createTestUser();
    const otherMember = await createTestUser();
    const group = await createTestGroup(owner.id);

    await expect(
      service.createExpense(outsider.id, {
        groupId: group.id,
        description: "Sneaky",
        amountMinorUnits: 100,
        payerId: otherMember.id,
        splitType: "EXACT",
        participants: [{ userId: otherMember.id, amountMinorUnits: 100 }],
      }),
    ).rejects.toMatchObject({ code: "NOT_GROUP_MEMBER" });
    expect((await prisma.expense.count({ where: { groupId: group.id } }))).toBe(0);
  });
});