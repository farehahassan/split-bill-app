import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";

import { prisma } from "../../src/db/prisma.js";
import { AuthRepository } from "../../src/modules/auth/auth.repository.js";
import { GroupRepository } from "../../src/modules/groups/group.repository.js";
import { ExpenseRepository } from "../../src/modules/expenses/expense.repository.js";
import {
  generateAuthToken,
  hashAuthToken,
} from "../../src/modules/auth/auth-token.util.js";
import {
  generateRefreshToken,
  hashRefreshToken,
} from "../../src/modules/auth/refresh-token.util.js";
import { randomUUID } from "node:crypto";
import { createTestGroup, createTestUser, uniqueEmail } from "./helpers/fixtures.js";

const authRepository = new AuthRepository();
const groupRepository = new GroupRepository();
const expenseRepository = new ExpenseRepository();

/**
 * Runs a block that mutates rows and is expected to fail; returns the error.
 */
async function capturesError<T>(operation: () => Promise<T>): Promise<Error> {
  try {
    await operation();
  } catch (error) {
    return error as Error;
  }
  throw new Error("Expected the operation to throw, but it succeeded.");
}

describe("transactional integrity (PostgreSQL)", () => {
  it("createUserWithAuthData is atomic: a duplicate email rolls back the whole write", async () => {
    const email = uniqueEmail();
    const passwordHash = "hash-a";
    const data = {
      name: "Ada",
      email,
      passwordHash,
      refreshTokenHash: hashRefreshToken(generateRefreshToken()),
      refreshTokenExpiresAt: new Date(Date.now() + 100_000),
      verificationTokenHash: hashAuthToken(generateAuthToken()),
      verificationTokenExpiresAt: new Date(Date.now() + 100_000),
    };

    const user = await authRepository.createUserWithAuthData(data);

    const error = await capturesError(() => authRepository.createUserWithAuthData(data));
    expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    expect((error as Prisma.PrismaClientKnownRequestError).code).toBe("P2002");

    // The failed transaction left NO user, refresh token, or auth token behind.
    expect((await prisma.user.count({ where: { id: user.id } }))).toBe(1);
    expect((await prisma.refreshToken.count({ where: { userId: user.id } }))).toBe(1);
    expect((await prisma.authToken.count({ where: { userId: user.id } }))).toBe(1);
  });

  it("createGroupWithOwner is atomic: owner membership and the activity event share one transaction", async () => {
    const owner = await createTestUser();
    const group = await groupRepository.createGroupWithOwner(owner.id, { name: "Trip" }, {
      userId: owner.id,
      type: "GROUP_CREATED",
      message: "created the group",
    });

    expect((await prisma.group.count({ where: { id: group.id } }))).toBe(1);
    expect(
      (await prisma.groupMember.count({ where: { groupId: group.id } })),
    ).toBe(1);
    expect(
      (await prisma.activityEvent.count({
        where: { groupId: group.id, type: "GROUP_CREATED" },
      })),
    ).toBe(1);
  });

  it("rolls back a multi-write transaction when a later statement fails", async () => {
    const owner = await createTestUser();
    const failure = await capturesError(() =>
      prisma.$transaction(async (tx) => {
        const group = await tx.group.create({ data: { name: "Doomed", createdById: owner.id } });
        await tx.groupMember.create({ data: { groupId: group.id, userId: owner.id } });
        throw new Error("boom mid-transaction");
      }),
    );
    expect(failure.message).toBe("boom mid-transaction");

    // Nothing from the failed transaction persisted.
    expect((await prisma.group.count({ where: { createdById: owner.id } }))).toBe(0);
    expect((await prisma.groupMember.count({ where: { userId: owner.id } }))).toBe(0);
  });

  it("createExpenseWithSplits rolls back entirely when a split references an unknown user", async () => {
    const owner = await createTestUser();
    const member = await createTestUser();
    const group = await createTestGroup(owner.id);
    const fakeUserId = randomUUID();

    const error = await capturesError(() =>
      expenseRepository.createExpenseWithSplits(
        {
          groupId: group.id,
          paidById: owner.id,
          description: "Dinner",
          amountMinorUnits: 1200n,
          currencyCode: "PKR",
          splitType: "EXACT",
          expenseDate: new Date(),
          splits: [
            { userId: member.id, amountMinorUnits: 500n },
            { userId: fakeUserId, amountMinorUnits: 700n },
          ],
        },
        { userId: owner.id, type: "EXPENSE_ADDED", message: "added the expense" },
      ),
    );
    expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    expect((error as Prisma.PrismaClientKnownRequestError).code).toBe("P2003");

    // No expense, split, or activity rows were left behind.
    expect((await prisma.expense.count({ where: { groupId: group.id } }))).toBe(0);
    expect(
      (await prisma.activityEvent.count({ where: { groupId: group.id } })),
    ).toBe(0);
  });

  it("a group owner cannot be deleted while their group exists (Restrict)", async () => {
    const owner = await createTestUser();
    await createTestGroup(owner.id);

    const error = await capturesError(() => prisma.user.delete({ where: { id: owner.id } }));
    // PostgreSQL reports RESTRICT violations as restrict_violation (23001),
    // which Prisma surfaces as an unknown request error — not a P-code.
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("RESTRICT");
    expect(await prisma.user.findUnique({ where: { id: owner.id } })).not.toBeNull();
  });

  it("group membership enforces the (groupId, userId) unique constraint", async () => {
    const owner = await createTestUser();
    const member = await createTestUser();
    const group = await createTestGroup(owner.id);

    await groupRepository.addGroupMember(group.id, member.id, {
      userId: owner.id,
      type: "MEMBER_ADDED",
      message: "added a member",
    });

    const error = await capturesError(() =>
      groupRepository.addGroupMember(group.id, member.id, {
        userId: owner.id,
        type: "MEMBER_ADDED",
        message: "added a member again",
      }),
    );
    expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    expect((error as Prisma.PrismaClientKnownRequestError).code).toBe("P2002");
  });

  it("duplicate split participants are prevented by the (expenseId, userId) unique constraint", async () => {
    const owner = await createTestUser();
    const member = await createTestUser();
    const group = await createTestGroup(owner.id);

    const created = await expenseRepository.createExpenseWithSplits(
      {
        groupId: group.id,
        paidById: owner.id,
        description: "Taxi",
        amountMinorUnits: 2000n,
        currencyCode: "PKR",
        splitType: "EXACT",
        expenseDate: new Date(),
        splits: [
          { userId: owner.id, amountMinorUnits: 1000n },
          { userId: member.id, amountMinorUnits: 1000n },
        ],
      },
      { userId: owner.id, type: "EXPENSE_ADDED", message: "added the expense" },
    );

    const error = await capturesError(() =>
      prisma.expenseSplit.create({
        data: {
          expenseId: created.id,
          userId: owner.id,
          amountMinorUnits: 0n,
        },
      }),
    );
    expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    expect((error as Prisma.PrismaClientKnownRequestError).code).toBe("P2002");
  });
});