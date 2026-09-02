import { describe, it, expect, vi, beforeEach } from "vitest";

import { SettlementService } from "../src/modules/settlements/settlement.service.js";
import { SettlementRepository } from "../src/modules/settlements/settlement.repository.js";
import { APP_ERRORS } from "../src/constants/app-errors.js";
import { HTTP_STATUSES } from "../src/constants/http-statuses.js";
import type { GroupMemberUser } from "../src/modules/settlements/settlement.repository.js";

vi.mock("../src/modules/settlements/settlement.repository.js", async () => {
  const actual = await vi.importActual<
    typeof import("../src/modules/settlements/settlement.repository.js")
  >("../src/modules/settlements/settlement.repository.js");
  return {
    ...actual,
    SettlementRepository: vi.fn(() => ({
      findGroupById: vi.fn(),
      findGroupMembers: vi.fn(),
      findExpensesForBalances: vi.fn(),
      findSettlementsForBalances: vi.fn(),
      createSettlement: vi.fn(),
      findSettlementById: vi.fn(),
      findSettlementsByGroupId: vi.fn(),
    })),
  };
});

const repository = vi.mocked(new SettlementRepository());

function makeService(): SettlementService {
  return new SettlementService(repository);
}

function members(ids: string[]): GroupMemberUser[] {
  return ids.map((userId) => ({
    userId,
    user: { id: userId, name: `User ${userId}`, email: `${userId}@example.com` },
  }));
}

const group = { id: "group-1", name: "Trip to Naran", createdById: "owner-1" };
const memberIds = ["owner-1", "alice", "bob"];
const defaultInput = {
  groupId: "group-1",
  payerId: "bob",
  payeeId: "alice",
  amountMinorUnits: 500,
};

function storedSettlement(overrides: Record<string, unknown> = {}) {
  return {
    id: "settlement-1",
    groupId: "group-1",
    payerId: "bob",
    payeeId: "alice",
    amountMinorUnits: 500n,
    currencyCode: "PKR",
    settledAt: new Date("2026-01-01T00:00:00Z"),
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    payer: { id: "bob", name: "User bob", email: "bob@example.com" },
    payee: { id: "alice", name: "User alice", email: "alice@example.com" },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SettlementService.getGroupBalances", () => {
  it("derives balances from expenses, splits, and settlements with zero filled in", async () => {
    repository.findGroupById.mockResolvedValue(group);
    repository.findGroupMembers.mockResolvedValue(members(memberIds));
    repository.findExpensesForBalances.mockResolvedValue([
      {
        paidById: "alice",
        amountMinorUnits: 300n,
        splits: [
          { userId: "alice", amountMinorUnits: 100n },
          { userId: "bob", amountMinorUnits: 100n },
          { userId: "owner-1", amountMinorUnits: 100n },
        ],
      },
    ]);
    repository.findSettlementsForBalances.mockResolvedValue([
      { payerId: "bob", payeeId: "alice", amountMinorUnits: 40n },
    ]);

    const service = makeService();
    const result = await service.getGroupBalances("alice", "group-1");

    const byUser = new Map(result.map((b) => [b.userId, b]));
    expect(byUser.get("alice")?.amountMinorUnits).toBe(160);
    expect(byUser.get("bob")?.amountMinorUnits).toBe(-60);
    expect(byUser.get("owner-1")?.amountMinorUnits).toBe(-100);
    // zero-balance members still appear
    expect(result).toHaveLength(3);
    expect(result.every((b) => typeof b.amountMinorUnits === "number")).toBe(true);
  });

  it("throws NOT_FOUND when the group does not exist", async () => {
    repository.findGroupById.mockResolvedValue(null);

    const service = makeService();
    await expect(service.getGroupBalances("alice", "missing")).rejects.toMatchObject({
      code: APP_ERRORS.GROUP_NOT_FOUND,
      statusCode: HTTP_STATUSES.NOT_FOUND,
    });
    expect(repository.findGroupMembers).not.toHaveBeenCalled();
  });

  it("throws FORBIDDEN when the requester is not a group member", async () => {
    repository.findGroupById.mockResolvedValue(group);
    repository.findGroupMembers.mockResolvedValue(members(memberIds));

    const service = makeService();
    await expect(service.getGroupBalances("outsider", "group-1")).rejects.toMatchObject({
      code: APP_ERRORS.NOT_GROUP_MEMBER,
      statusCode: HTTP_STATUSES.FORBIDDEN,
    });
    expect(repository.findExpensesForBalances).not.toHaveBeenCalled();
    expect(repository.findSettlementsForBalances).not.toHaveBeenCalled();
  });
});

describe("SettlementService.createSettlement", () => {
  it("creates a settlement and converts bigint amounts", async () => {
    repository.findGroupById.mockResolvedValue(group);
    repository.findGroupMembers.mockResolvedValue(members(memberIds));
    repository.createSettlement.mockResolvedValue(storedSettlement());

    const service = makeService();
    const result = await service.createSettlement("owner-1", defaultInput);

    expect(repository.createSettlement).toHaveBeenCalledTimes(1);
    const data = repository.createSettlement.mock.calls[0][0];
    expect(data.amountMinorUnits).toBe(500n);
    expect(data.payerId).toBe("bob");
    expect(data.payeeId).toBe("alice");
    expect(data.currencyCode).toBe("PKR");
    expect(data.settledAt).toBeInstanceOf(Date);
    expect(result.amountMinorUnits).toBe(500);
  });

  it("throws NOT_FOUND when the group does not exist", async () => {
    repository.findGroupById.mockResolvedValue(null);

    const service = makeService();
    await expect(service.createSettlement("owner-1", defaultInput)).rejects.toMatchObject({
      code: APP_ERRORS.GROUP_NOT_FOUND,
      statusCode: HTTP_STATUSES.NOT_FOUND,
    });
    expect(repository.createSettlement).not.toHaveBeenCalled();
  });

  it("throws FORBIDDEN when the requester is not a group member", async () => {
    repository.findGroupById.mockResolvedValue(group);
    repository.findGroupMembers.mockResolvedValue(members(memberIds));

    const service = makeService();
    await expect(service.createSettlement("outsider", defaultInput)).rejects.toMatchObject({
      code: APP_ERRORS.NOT_GROUP_MEMBER,
      statusCode: HTTP_STATUSES.FORBIDDEN,
    });
    expect(repository.createSettlement).not.toHaveBeenCalled();
  });

  it("throws BAD_REQUEST when sender and receiver are the same user", async () => {
    repository.findGroupById.mockResolvedValue(group);
    repository.findGroupMembers.mockResolvedValue(members(memberIds));

    const service = makeService();
    await expect(
      service.createSettlement("owner-1", { ...defaultInput, payeeId: "bob" }),
    ).rejects.toMatchObject({
      code: APP_ERRORS.SETTLEMENT_USERS_MUST_DIFFER,
      statusCode: HTTP_STATUSES.BAD_REQUEST,
    });
    expect(repository.createSettlement).not.toHaveBeenCalled();
  });

  it("throws FORBIDDEN when the sender is not a group member", async () => {
    repository.findGroupById.mockResolvedValue(group);
    repository.findGroupMembers.mockResolvedValue(members(memberIds));

    const service = makeService();
    await expect(
      service.createSettlement("owner-1", { ...defaultInput, payerId: "outsider" }),
    ).rejects.toMatchObject({
      code: APP_ERRORS.SETTLEMENT_PAYER_NOT_GROUP_MEMBER,
      statusCode: HTTP_STATUSES.FORBIDDEN,
    });
    expect(repository.createSettlement).not.toHaveBeenCalled();
  });

  it("throws FORBIDDEN when the receiver is not a group member", async () => {
    repository.findGroupById.mockResolvedValue(group);
    repository.findGroupMembers.mockResolvedValue(members(memberIds));

    const service = makeService();
    await expect(
      service.createSettlement("owner-1", { ...defaultInput, payeeId: "outsider" }),
    ).rejects.toMatchObject({
      code: APP_ERRORS.SETTLEMENT_PAYEE_NOT_GROUP_MEMBER,
      statusCode: HTTP_STATUSES.FORBIDDEN,
    });
    expect(repository.createSettlement).not.toHaveBeenCalled();
  });
});

describe("SettlementService.getGroupSettlements", () => {
  it("returns only settlements belonging to the requested group", async () => {
    repository.findGroupById.mockResolvedValue(group);
    repository.findGroupMembers.mockResolvedValue(members(memberIds));
    repository.findSettlementsByGroupId.mockResolvedValue([storedSettlement()]);

    const service = makeService();
    const result = await service.getGroupSettlements("alice", "group-1");

    expect(repository.findSettlementsByGroupId).toHaveBeenCalledWith("group-1");
    expect(result).toHaveLength(1);
    expect(result[0].amountMinorUnits).toBe(500);
  });

  it("throws NOT_FOUND when the group does not exist", async () => {
    repository.findGroupById.mockResolvedValue(null);

    const service = makeService();
    await expect(service.getGroupSettlements("alice", "missing")).rejects.toMatchObject({
      code: APP_ERRORS.GROUP_NOT_FOUND,
      statusCode: HTTP_STATUSES.NOT_FOUND,
    });
  });

  it("throws FORBIDDEN when the requester is not a member", async () => {
    repository.findGroupById.mockResolvedValue(group);
    repository.findGroupMembers.mockResolvedValue(members(memberIds));

    const service = makeService();
    await expect(service.getGroupSettlements("outsider", "group-1")).rejects.toMatchObject({
      code: APP_ERRORS.NOT_GROUP_MEMBER,
      statusCode: HTTP_STATUSES.FORBIDDEN,
    });
    expect(repository.findSettlementsByGroupId).not.toHaveBeenCalled();
  });
});

describe("SettlementService.getSettlementById", () => {
  it("returns a settlement for a member of its group", async () => {
    repository.findSettlementById.mockResolvedValue(storedSettlement());
    repository.findGroupMembers.mockResolvedValue(members(memberIds));

    const service = makeService();
    const result = await service.getSettlementById("alice", "settlement-1");

    expect(repository.findGroupMembers).toHaveBeenCalledWith("group-1");
    expect(result.id).toBe("settlement-1");
    expect(result.amountMinorUnits).toBe(500);
  });

  it("throws NOT_FOUND when the settlement does not exist", async () => {
    repository.findSettlementById.mockResolvedValue(null);

    const service = makeService();
    await expect(service.getSettlementById("alice", "missing")).rejects.toMatchObject({
      code: APP_ERRORS.SETTLEMENT_NOT_FOUND,
      statusCode: HTTP_STATUSES.NOT_FOUND,
    });
  });

  it("throws FORBIDDEN for a non-member of the settlement's group (IDOR guard)", async () => {
    repository.findSettlementById.mockResolvedValue(storedSettlement({ groupId: "group-1" }));
    repository.findGroupMembers.mockResolvedValue(members(["zoe", "jane"]));

    const service = makeService();
    await expect(service.getSettlementById("outsider", "settlement-1")).rejects.toMatchObject({
      code: APP_ERRORS.NOT_GROUP_MEMBER,
      statusCode: HTTP_STATUSES.FORBIDDEN,
    });
  });
});
