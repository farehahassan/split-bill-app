import { describe, expect, it } from "vitest";

import { prisma } from "../../src/db/prisma.js";
import { APP_ERRORS } from "../../src/constants/app-errors.js";
import { createRequestHash } from "../../src/modules/idempotency/request-hash.js";
import { SettlementRepository } from "../../src/modules/settlements/settlement.repository.js";
import { SettlementService } from "../../src/modules/settlements/settlement.service.js";
import { addTestMember, createTestGroup, createTestUser } from "./helpers/fixtures.js";

const service = new SettlementService(new SettlementRepository());

interface SettlementFixture {
  groupId: string;
  ownerId: string;
  memberAId: string;
  memberBId: string;
}

async function createSettlementFixture(): Promise<SettlementFixture> {
  const owner = await createTestUser();
  const memberA = await createTestUser();
  const memberB = await createTestUser();
  const group = await createTestGroup(owner.id);
  await addTestMember(group.id, memberA.id);
  await addTestMember(group.id, memberB.id);
  return { groupId: group.id, ownerId: owner.id, memberAId: memberA.id, memberBId: memberB.id };
}

function idempotencyFor(input: {
  key: string;
  userId: string;
  groupId: string;
  payerId: string;
  payeeId: string;
  amountMinorUnits: number;
}) {
  return {
    key: input.key,
    userId: input.userId,
    requestHash: createRequestHash({
      groupId: input.groupId,
      payerId: input.payerId,
      payeeId: input.payeeId,
      amountMinorUnits: input.amountMinorUnits,
    }),
  };
}

describe("settlement persistence + idempotency (PostgreSQL + Redis)", () => {
  it("persists the settlement, the SETTLEMENT_ADDED activity, and a COMPLETED idempotency record", async () => {
    const { groupId, ownerId, memberAId } = await createSettlementFixture();
    const key = "settlement-key-0001";

    const settlement = await service.createSettlement(
      ownerId,
      { groupId, payerId: ownerId, payeeId: memberAId, amountMinorUnits: 7500 },
      idempotencyFor({ key, userId: ownerId, groupId, payerId: ownerId, payeeId: memberAId, amountMinorUnits: 7500 }),
    );

    const row = await prisma.settlement.findUnique({ where: { id: settlement.id } });
    expect(row).not.toBeNull();
    expect(row!.amountMinorUnits).toBe(7500n);
    expect(row!.currencyCode).toBe("PKR");

    expect(
      (await prisma.activityEvent.count({ where: { groupId, type: "SETTLEMENT_ADDED" } })),
    ).toBe(1);

    const record = await prisma.idempotencyRecord.findUnique({ where: { key } });
    expect(record).not.toBeNull();
    expect(record!.status).toBe("COMPLETED");
    expect(record!.resourceId).toBe(settlement.id);
    expect(record!.scope).toBe(groupId);
  });

  it("replaying the same key + body returns the original settlement and creates no duplicate", async () => {
    const { groupId, ownerId, memberAId } = await createSettlementFixture();
    const key = "settlement-key-0002";

    const input = { key, userId: ownerId, groupId, payerId: ownerId, payeeId: memberAId, amountMinorUnits: 1200 };
    const called = async () =>
      service.createSettlement(
        ownerId,
        { groupId, payerId: ownerId, payeeId: memberAId, amountMinorUnits: 1200 },
        idempotencyFor(input),
      );

    const first = await called();
    const replay = await called();

    expect(replay.id).toBe(first.id);
    expect((await prisma.settlement.count({ where: { groupId } }))).toBe(1);
    expect((await prisma.idempotencyRecord.count({ where: { key } }))).toBe(1);
  });

  it("reusing a key with a different request body 409s", async () => {
    const { groupId, ownerId, memberAId } = await createSettlementFixture();
    const key = "settlement-key-0003";

    await service.createSettlement(
      ownerId,
      { groupId, payerId: ownerId, payeeId: memberAId, amountMinorUnits: 1000 },
      idempotencyFor({ key, userId: ownerId, groupId, payerId: ownerId, payeeId: memberAId, amountMinorUnits: 1000 }),
    );

    await expect(
      service.createSettlement(
        ownerId,
        { groupId, payerId: ownerId, payeeId: memberAId, amountMinorUnits: 5000 },
        idempotencyFor({ key, userId: ownerId, groupId, payerId: ownerId, payeeId: memberAId, amountMinorUnits: 5000 }),
      ),
    ).rejects.toMatchObject({ code: APP_ERRORS.IDEMPOTENCY_KEY_REUSED });
  });

  it("reusing another user's key 409s", async () => {
    const { groupId, ownerId, memberAId, memberBId } = await createSettlementFixture();
    const key = "settlement-key-0004";

    await service.createSettlement(
      ownerId,
      { groupId, payerId: ownerId, payeeId: memberAId, amountMinorUnits: 1000 },
      idempotencyFor({ key, userId: ownerId, groupId, payerId: ownerId, payeeId: memberAId, amountMinorUnits: 1000 }),
    );

    // memberBId is a member of the group but never used this key: still a conflict.
    await expect(
      service.createSettlement(
        memberBId,
        { groupId, payerId: memberBId, payeeId: memberAId, amountMinorUnits: 1000 },
        idempotencyFor({ key, userId: memberBId, groupId, payerId: memberBId, payeeId: memberAId, amountMinorUnits: 1000 }),
      ),
    ).rejects.toMatchObject({ code: APP_ERRORS.IDEMPOTENCY_KEY_REUSED });
  });

  it("concurrent requests with the same key create exactly one settlement", async () => {
    const { groupId, ownerId, memberAId } = await createSettlementFixture();
    const key = "settlement-key-0005";
    const input = { key, userId: ownerId, groupId, payerId: ownerId, payeeId: memberAId, amountMinorUnits: 2000 };

    const attempt = () =>
      service.createSettlement(
        ownerId,
        { groupId, payerId: ownerId, payeeId: memberAId, amountMinorUnits: 2000 },
        idempotencyFor(input),
      );

    // The per-group distributed lock serializes them: exactly one request wins
    // the lock and persists the settlement; the loser gets 409 and retries.
    const results = await Promise.allSettled([attempt(), attempt(), attempt()]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");

    expect(fulfilled.length).toBeGreaterThan(0);
    const ids = fulfilled.map((r) => (r.status === "fulfilled" ? r.value.id : null));
    expect(new Set(ids).size).toBe(1);

    for (const result of results) {
      if (result.status === "rejected") {
        expect(result.reason).toMatchObject({ code: APP_ERRORS.SETTLEMENT_CONCURRENT_LOCKED });
      }
    }

    expect((await prisma.settlement.count({ where: { groupId } }))).toBe(1);
    expect((await prisma.idempotencyRecord.count({ where: { key } }))).toBe(1);
  });

  it("an expired idempotency record is replaced, allowing a fresh settlement", async () => {
    const { groupId, ownerId, memberAId } = await createSettlementFixture();
    const key = "settlement-key-0006";
    const input = { key, userId: ownerId, groupId, payerId: ownerId, payeeId: memberAId, amountMinorUnits: 900 };

    await service.createSettlement(
      ownerId,
      { groupId, payerId: ownerId, payeeId: memberAId, amountMinorUnits: 900 },
      idempotencyFor(input),
    );

    await prisma.idempotencyRecord.updateMany({
      where: { key },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const second = await service.createSettlement(
      ownerId,
      { groupId, payerId: ownerId, payeeId: memberAId, amountMinorUnits: 900 },
      idempotencyFor(input),
    );

    expect(second.id).not.toBeNull();
    expect((await prisma.settlement.count({ where: { groupId } }))).toBe(2);
    expect((await prisma.idempotencyRecord.count({ where: { key } }))).toBe(1);
    expect((await prisma.idempotencyRecord.findFirst({ where: { key } }))!.resourceId).toBe(
      second.id,
    );
  });

  it("balances reconcile expenses and settlements against persisted rows", async () => {
    const { groupId, ownerId, memberAId, memberBId } = await createSettlementFixture();

    // Owner paid 6000 split equally among all three (2000 each).
    await prisma.expense.create({
      data: {
        groupId,
        paidById: ownerId,
        description: "Shared dinner",
        amountMinorUnits: 6000n,
        currencyCode: "PKR",
        splitType: "EQUAL",
        expenseDate: new Date(),
        splits: {
          create: [
            { userId: ownerId, amountMinorUnits: 2000n },
            { userId: memberAId, amountMinorUnits: 2000n },
            { userId: memberBId, amountMinorUnits: 2000n },
          ],
        },
      },
    });

    // memberAId settles 1500 back to the owner.
    await prisma.settlement.create({
      data: {
        groupId,
        payerId: memberAId,
        payeeId: ownerId,
        amountMinorUnits: 1500n,
        currencyCode: "PKR",
        settledAt: new Date(),
      },
    });

    const balances = await service.getGroupBalances(ownerId, groupId);
    const byUser = new Map(balances.map((balance) => [balance.userId, balance.amountMinorUnits]));

    // Owner: +6000 (expense credit) - 2000 (own split) - 1500 (payee debit) = +2500.
    expect(byUser.get(ownerId)).toBe(2500);
    // memberAId: -2000 (split) + 1500 (settlement credit to payer) = -500.
    expect(byUser.get(memberAId)).toBe(-500);
    // memberBId: -2000.
    expect(byUser.get(memberBId)).toBe(-2000);

    // The accounting invariant: all balances sum to zero.
    const sum = balances.reduce((acc, balance) => acc + balance.amountMinorUnits, 0);
    expect(sum).toBe(0);
  });

  it("exposes stored settlements with payer and payee details", async () => {
    const { groupId, ownerId, memberAId } = await createSettlementFixture();
    const key = "settlement-key-0007";

    await service.createSettlement(
      ownerId,
      { groupId, payerId: ownerId, payeeId: memberAId, amountMinorUnits: 5000 },
      idempotencyFor({ key, userId: ownerId, groupId, payerId: ownerId, payeeId: memberAId, amountMinorUnits: 5000 }),
    );

    const settlements = await service.getGroupSettlements(ownerId, groupId);
    expect(settlements).toHaveLength(1);
    expect(settlements[0]!.payer.id).toBe(ownerId);
    expect(settlements[0]!.payee.id).toBe(memberAId);
    expect(settlements[0]!.amountMinorUnits).toBe(5000);
  });
});