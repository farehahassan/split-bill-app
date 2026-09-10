import { describe, it, expect, vi, beforeEach } from "vitest";

import { GroupService } from "../src/modules/groups/group.service.js";
import { GroupRepository } from "../src/modules/groups/group.repository.js";
import { ExpenseService } from "../src/modules/expenses/expense.service.js";
import { ExpenseRepository } from "../src/modules/expenses/expense.repository.js";
import { SettlementService } from "../src/modules/settlements/settlement.service.js";
import { SettlementRepository } from "../src/modules/settlements/settlement.repository.js";

vi.mock("../src/modules/groups/group.repository.js", async () => {
  const actual = await vi.importActual<typeof import("../src/modules/groups/group.repository.js")>(
    "../src/modules/groups/group.repository.js",
  );
  return {
    ...actual,
    GroupRepository: vi.fn(() => ({
      createGroupWithOwner: vi.fn(),
      findGroupById: vi.fn(),
      findUserById: vi.fn(),
      isGroupMember: vi.fn(),
      addGroupMember: vi.fn(),
    })),
  };
});

vi.mock("../src/modules/expenses/expense.repository.js", async () => {
  const actual = await vi.importActual<
    typeof import("../src/modules/expenses/expense.repository.js")
  >("../src/modules/expenses/expense.repository.js");
  return {
    ...actual,
    ExpenseRepository: vi.fn(() => ({
      findGroupById: vi.fn(),
      findGroupMemberIds: vi.fn(),
      createExpenseWithSplits: vi.fn(),
    })),
  };
});

vi.mock("../src/modules/settlements/settlement.repository.js", async () => {
  const actual = await vi.importActual<
    typeof import("../src/modules/settlements/settlement.repository.js")
  >("../src/modules/settlements/settlement.repository.js");
  return {
    ...actual,
    SettlementRepository: vi.fn(() => ({
      findGroupById: vi.fn(),
      findGroupMembers: vi.fn(),
      createSettlement: vi.fn(),
    })),
  };
});

const groupRepository = vi.mocked(new GroupRepository());
const expenseRepository = vi.mocked(new ExpenseRepository());
const settlementRepository = vi.mocked(new SettlementRepository());

const group = {
  id: "group-1",
  name: "Trip to Naran",
  createdById: "owner-1",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

const groupLookup = { id: "group-1", name: "Trip to Naran", createdById: "owner-1" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Activity creation on domain operations", () => {
  it("records a GROUP_CREATED event with the authenticated creator as actor", async () => {
    groupRepository.createGroupWithOwner.mockResolvedValue(group);

    const service = new GroupService(groupRepository);
    await service.createGroup("owner-1", { name: "Trip to Naran" });

    expect(groupRepository.createGroupWithOwner).toHaveBeenCalledWith(
      "owner-1",
      { name: "Trip to Naran" },
      {
        userId: "owner-1",
        type: "GROUP_CREATED",
        message: "created the group",
      },
    );
  });

  it("records a MEMBER_ADDED event with the authenticated owner as actor", async () => {
    groupRepository.findGroupById.mockResolvedValue(groupLookup);
    groupRepository.findUserById.mockResolvedValue({
      id: "member-1",
      name: "Sana",
      email: "sana@example.com",
    });
    groupRepository.isGroupMember.mockResolvedValue(false);
    groupRepository.addGroupMember.mockResolvedValue({
      id: "membership-1",
      groupId: "group-1",
      userId: "member-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const service = new GroupService(groupRepository);
    await service.addGroupMember("owner-1", "group-1", "member-1");

    expect(groupRepository.addGroupMember).toHaveBeenCalledWith("group-1", "member-1", {
      userId: "owner-1",
      type: "MEMBER_ADDED",
      message: "added Sana to the group",
    });
  });

  it("records an EXPENSE_ADDED event with the authenticated requester as actor", async () => {
    expenseRepository.findGroupById.mockResolvedValue(groupLookup);
    expenseRepository.findGroupMemberIds.mockResolvedValue([
      "owner-1",
      "payer-1",
      "member-1",
      "user-3",
    ]);
    const createdExpense = {
      id: "expense-1",
      groupId: "group-1",
      paidById: "payer-1",
      description: "Dinner",
      amountMinorUnits: 1000n,
      currencyCode: "PKR",
      splitType: "EQUAL" as const,
      expenseDate: new Date("2026-01-01T00:00:00Z"),
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
      payer: { id: "payer-1", name: "Payer", email: "payer@example.com" },
      splits: [],
    };
    expenseRepository.createExpenseWithSplits.mockResolvedValue(createdExpense);

    const service = new ExpenseService(expenseRepository);
    await service.createExpense("owner-1", {
      groupId: "group-1",
      description: "Dinner",
      amountMinorUnits: 1000,
      payerId: "payer-1",
      splitType: "EQUAL",
      participants: [{ userId: "payer-1" }, { userId: "member-1" }, { userId: "user-3" }],
    });

    const activityArg = expenseRepository.createExpenseWithSplits.mock.calls[0][1];
    expect(activityArg).toEqual({
      userId: "owner-1",
      type: "EXPENSE_ADDED",
      message: 'added the expense "Dinner"',
    });
  });

  it("records a SETTLEMENT_ADDED event with the authenticated requester as actor", async () => {
    settlementRepository.findGroupById.mockResolvedValue(groupLookup);
    settlementRepository.findGroupMembers.mockResolvedValue([
      { userId: "owner-1", user: { id: "owner-1", name: "Owner", email: "owner@example.com" } },
      { userId: "alice", user: { id: "alice", name: "Alice", email: "alice@example.com" } },
      { userId: "bob", user: { id: "bob", name: "Bob", email: "bob@example.com" } },
    ]);
    settlementRepository.createSettlement.mockResolvedValue({
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
    });

    const service = new SettlementService(settlementRepository);
    await service.createSettlement(
      "owner-1",
      {
        groupId: "group-1",
        payerId: "bob",
        payeeId: "alice",
        amountMinorUnits: 500,
      },
      {
        key: "key-12345678",
        userId: "owner-1",
        requestHash: "hash-of-request",
      },
    );

    const activityArg = settlementRepository.createSettlement.mock.calls[0][2];
    expect(activityArg).toEqual({
      userId: "owner-1",
      type: "SETTLEMENT_ADDED",
      message: "recorded a settlement",
    });
  });

  it("always records the authenticated requester as the actor, never the target user", async () => {
    groupRepository.findGroupById.mockResolvedValue(groupLookup);
    groupRepository.findUserById.mockResolvedValue({
      id: "member-1",
      name: "Sana",
      email: "sana@example.com",
    });
    groupRepository.isGroupMember.mockResolvedValue(false);
    groupRepository.addGroupMember.mockResolvedValue({
      id: "membership-1",
      groupId: "group-1",
      userId: "member-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const service = new GroupService(groupRepository);
    await service.addGroupMember("owner-1", "group-1", "member-1");

    const activityArg = groupRepository.addGroupMember.mock.calls[0][2];
    expect((activityArg as { userId: string }).userId).toBe("owner-1");
    expect((activityArg as { userId: string }).userId).not.toBe("member-1");
  });
});
