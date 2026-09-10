import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Prisma } from "@prisma/client";

import { loadEnv, resetEnv } from "../src/config/env.js";
import { METRIC, METRIC_LABEL, resetMetrics, metrics } from "../src/metrics/registry.js";
import { APP_ERRORS } from "../src/constants/app-errors.js";
import type { IdempotencyContext } from "../src/modules/idempotency/reconcile.js";

import { AuthService } from "../src/modules/auth/auth.service.js";
import type { AuthRepository } from "../src/modules/auth/auth.repository.js";
import { GroupService } from "../src/modules/groups/group.service.js";
import type { GroupRepository } from "../src/modules/groups/group.repository.js";
import { ExpenseService } from "../src/modules/expenses/expense.service.js";
import type { ExpenseRepository } from "../src/modules/expenses/expense.repository.js";
import { SettlementService } from "../src/modules/settlements/settlement.service.js";
import type { SettlementRepository } from "../src/modules/settlements/settlement.repository.js";
import type { DistributedLock } from "../src/redis/distributedLock.js";
import { createActivityEvent } from "../src/modules/activity/activity.repository.js";

const idempotency: IdempotencyContext = { key: "key-1", userId: "owner", requestHash: "hash-1" };

function count(name: string): number {
  return metrics.counterValue(name);
}

beforeEach(() => {
  resetEnv();
  loadEnv();
  resetMetrics();
  vi.clearAllMocks();
});

describe("users_registered_total", () => {
  it("increments once when a user has registered successfully", async () => {
    const repository = {
      findByEmail: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({
        id: "user-1",
        name: "Ahmed",
        email: "ahmed@example.com",
        passwordHash: "hash",
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      createRefreshToken: vi.fn().mockResolvedValue({ id: "session-1" }),
    } as unknown as AuthRepository;

    const service = new AuthService(repository);
    await service.register({ name: "Ahmed", email: "ahmed@example.com", password: "password" });

    expect(count(METRIC.usersRegisteredTotal)).toBe(1);
  });

  it("does not count a registration blocked by an existing email", async () => {
    const repository = {
      findByEmail: vi.fn().mockResolvedValue({ id: "user-1" }),
    } as unknown as AuthRepository;

    const service = new AuthService(repository);
    await expect(
      service.register({ name: "Ahmed", email: "ahmed@example.com", password: "password" }),
    ).rejects.toMatchObject({ code: APP_ERRORS.EMAIL_IN_USE });

    expect(count(METRIC.usersRegisteredTotal)).toBe(0);
  });
});

describe("groups_created_total", () => {
  it("increments once when a group has been created", async () => {
    const repository = {
      createGroupWithOwner: vi.fn().mockResolvedValue({
        id: "group-1",
        name: "Trip to Naran",
        createdById: "user-1",
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    } as unknown as GroupRepository;

    const service = new GroupService(repository, fakeCache());
    await service.createGroup("user-1", { name: "Trip to Naran" });

    expect(count(METRIC.groupsCreatedTotal)).toBe(1);
  });

  it("does not count when the group write fails", async () => {
    const repository = {
      createGroupWithOwner: vi.fn().mockRejectedValue(new Error("db down")),
    } as unknown as GroupRepository;

    const service = new GroupService(repository, fakeCache());
    await expect(service.createGroup("user-1", { name: "Nope" })).rejects.toThrow("db down");

    expect(count(METRIC.groupsCreatedTotal)).toBe(0);
  });
});

describe("expenses_created_total", () => {
  function makeRepository(): ExpenseRepository {
    return {
      findGroupById: vi.fn().mockResolvedValue({ id: "group-1", name: "G", createdById: "owner" }),
      findGroupMemberIds: vi.fn().mockResolvedValue(["owner", "user-1", "user-2"]),
      createExpenseWithSplits: vi.fn().mockResolvedValue({
        id: "expense-1",
        groupId: "group-1",
        paidById: "user-1",
        description: "Dinner",
        amountMinorUnits: 1000n,
        currencyCode: "PKR",
        splitType: "EQUAL",
        expenseDate: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        payer: { id: "user-1", name: "Ahmed", email: "a@example.com" },
        splits: [
          {
            id: "split-1",
            expenseId: "expense-1",
            userId: "user-1",
            amountMinorUnits: 1000n,
            createdAt: new Date(),
            updatedAt: new Date(),
            user: { id: "user-1", name: "Ahmed", email: "a@example.com" },
          },
        ],
      }),
    } as unknown as ExpenseRepository;
  }

  it("increments once when an expense has been created", async () => {
    const service = new ExpenseService(makeRepository());
    await service.createExpense("owner", {
      groupId: "group-1",
      description: "Dinner",
      amountMinorUnits: 1000,
      payerId: "user-1",
      splitType: "EQUAL",
      participants: [{ userId: "user-1" }],
    });

    expect(count(METRIC.expensesCreatedTotal)).toBe(1);
  });

  it("does not count when validation rejects the expense", async () => {
    const repository = {
      findGroupById: vi.fn().mockResolvedValue(null),
    } as unknown as ExpenseRepository;

    const service = new ExpenseService(repository);
    await expect(
      service.createExpense("owner", {
        groupId: "missing",
        description: "Dinner",
        amountMinorUnits: 1000,
        payerId: "user-1",
        splitType: "EQUAL",
        participants: [{ userId: "user-1" }],
      }),
    ).rejects.toMatchObject({ code: APP_ERRORS.GROUP_NOT_FOUND });

    expect(count(METRIC.expensesCreatedTotal)).toBe(0);
  });
});

describe("settlements_created_total", () => {
  const input = {
    groupId: "group-1",
    payerId: "bob",
    payeeId: "alice",
    amountMinorUnits: 500,
  };

  it("increments once when a settlement has been recorded", async () => {
    const repository = {
      findGroupById: vi.fn().mockResolvedValue({ id: "group-1", name: "G", createdById: "owner" }),
      findGroupMembers: vi.fn().mockResolvedValue([
        { userId: "owner", user: { id: "owner", name: "O", email: "o@example.com" } },
        { userId: "bob", user: { id: "bob", name: "Bob", email: "b@example.com" } },
        { userId: "alice", user: { id: "alice", name: "Alice", email: "a@example.com" } },
      ]),
      createSettlement: vi.fn().mockResolvedValue({
        id: "settlement-1",
        groupId: "group-1",
        payerId: "bob",
        payeeId: "alice",
        amountMinorUnits: 500n,
        currencyCode: "PKR",
        settledAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        payer: { id: "bob", name: "Bob", email: "b@example.com" },
        payee: { id: "alice", name: "Alice", email: "a@example.com" },
      }),
    } as unknown as SettlementRepository;

    const lock = {
      withLock: vi.fn(async (_key: string, operation: () => Promise<unknown>) => operation()),
    } as unknown as Pick<DistributedLock, "withLock">;

    const service = new SettlementService(repository, lock);
    await service.createSettlement("owner", input, idempotency);

    expect(lock.withLock).toHaveBeenCalledTimes(1);
    expect(count(METRIC.settlementsCreatedTotal)).toBe(1);
  });

  it("does not count when the settlement write fails", async () => {
    const repository = {
      findGroupById: vi.fn().mockResolvedValue({ id: "group-1", name: "G", createdById: "owner" }),
      findGroupMembers: vi.fn().mockResolvedValue([
        { userId: "owner", user: { id: "owner", name: "O", email: "o@example.com" } },
        { userId: "bob", user: { id: "bob", name: "Bob", email: "b@example.com" } },
        { userId: "alice", user: { id: "alice", name: "Alice", email: "a@example.com" } },
      ]),
      createSettlement: vi.fn().mockRejectedValue(new Error("db down")),
    } as unknown as SettlementRepository;

    const lock = {
      withLock: vi.fn(async (_key: string, operation: () => Promise<unknown>) => operation()),
    } as unknown as Pick<DistributedLock, "withLock">;

    const service = new SettlementService(repository, lock);
    await expect(service.createSettlement("owner", input, idempotency)).rejects.toThrow("db down");

    expect(count(METRIC.settlementsCreatedTotal)).toBe(0);
  });
});

describe("activity_events_created_total", () => {
  function fakeTx(create: ReturnType<typeof vi.fn>): Prisma.TransactionClient {
    return { activityEvent: { create } } as unknown as Prisma.TransactionClient;
  }

  const eventInput = {
    userId: "user-1",
    groupId: "group-1",
    type: "EXPENSE_ADDED" as const,
    message: "added the expense",
    occurredAt: new Date(),
  };

  it("counts a persisted activity event by its bounded type", async () => {
    const create = vi.fn().mockResolvedValue({ id: "event-1" });
    const tx = fakeTx(create);

    await createActivityEvent(tx, eventInput);

    expect(
      metrics.counterValue(METRIC.activityEventsCreatedTotal, {
        [METRIC_LABEL.activityType]: "EXPENSE_ADDED",
      }),
    ).toBe(1);
  });

  it("does not count when the event write fails", async () => {
    const create = vi.fn().mockRejectedValue(new Error("tx rollback"));
    const tx = fakeTx(create);

    await expect(createActivityEvent(tx, eventInput)).rejects.toThrow("tx rollback");

    expect(
      metrics.counterValue(METRIC.activityEventsCreatedTotal, {
        [METRIC_LABEL.activityType]: "EXPENSE_ADDED",
      }),
    ).toBe(0);
  });
});

function fakeCache() {
  return {
    getCachedGroupById: vi.fn(async () => null),
    setCachedGroupById: vi.fn(async () => {}),
    invalidateGroupCache: vi.fn(async () => {}),
  } as never;
}
