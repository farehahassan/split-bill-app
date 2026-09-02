import { describe, it, expect, vi, beforeEach } from "vitest";

import { ExpenseService } from "../src/modules/expenses/expense.service.js";
import { ExpenseRepository } from "../src/modules/expenses/expense.repository.js";
import { APP_ERRORS } from "../src/constants/app-errors.js";
import { HTTP_STATUSES } from "../src/constants/http-statuses.js";
import { sumSplitAmounts } from "../src/modules/expenses/split.util.js";

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
      findExpenseById: vi.fn(),
      findExpensesByGroupId: vi.fn(),
    })),
  };
});

const repository = vi.mocked(new ExpenseRepository());

function makeService(): ExpenseService {
  return new ExpenseService(repository);
}

interface MakeExpenseOptions {
  splits?: Array<{ userId: string; amountMinorUnits: bigint }>;
  groupId?: string;
  paidById?: string;
  splitType?: "EQUAL" | "EXACT";
}

function makeStoredExpense(options: MakeExpenseOptions = {}) {
  const groupId = options.groupId ?? "group-1";
  const paidById = options.paidById ?? "payer-1";
  const splits = options.splits ?? [{ userId: "payer-1", amountMinorUnits: 1000n }];
  return {
    id: "expense-1",
    groupId,
    paidById,
    description: "Dinner",
    amountMinorUnits: 1000n,
    currencyCode: "PKR",
    splitType: options.splitType ?? "EQUAL",
    expenseDate: new Date("2026-01-01T00:00:00Z"),
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    payer: { id: paidById, name: "Ahmed", email: "ahmed@example.com" },
    splits: splits.map((split) => ({
      id: `split-${split.userId}`,
      expenseId: "expense-1",
      userId: split.userId,
      amountMinorUnits: split.amountMinorUnits,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
      user: {
        id: split.userId,
        name: `User ${split.userId}`,
        email: `${split.userId}@example.com`,
      },
    })),
  };
}

const defaultInput = {
  groupId: "group-1",
  description: "Dinner",
  amountMinorUnits: 1000,
  payerId: "payer-1",
  splitType: "EQUAL" as const,
  participants: [{ userId: "payer-1" }, { userId: "user-2" }, { userId: "user-3" }],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ExpenseService.createExpense", () => {
  it("creates an expense with EQUAL splits that sum to the total", async () => {
    repository.findGroupById.mockResolvedValue({ id: "group-1", name: "G", createdById: "owner" });
    repository.findGroupMemberIds.mockResolvedValue(["owner", "payer-1", "user-2", "user-3"]);
    repository.createExpenseWithSplits.mockResolvedValue(
      makeStoredExpense({
        splits: [
          { userId: "payer-1", amountMinorUnits: 334n },
          { userId: "user-2", amountMinorUnits: 333n },
          { userId: "user-3", amountMinorUnits: 333n },
        ],
      }),
    );

    const service = makeService();
    const result = await service.createExpense("owner", defaultInput);

    expect(repository.createExpenseWithSplits).toHaveBeenCalledTimes(1);
    const createdData = repository.createExpenseWithSplits.mock.calls[0][0];
    expect(sumSplitAmounts(createdData.splits)).toBe(1000n);
    expect(result.amountMinorUnits).toBe(1000);
    expect(result.splits.map((split) => split.amountMinorUnits)).toEqual([334, 333, 333]);
  });

  it("creates an EXACT expense whose amounts sum to the total", async () => {
    repository.findGroupById.mockResolvedValue({ id: "group-1", name: "G", createdById: "owner" });
    repository.findGroupMemberIds.mockResolvedValue(["owner", "payer-1", "user-2", "user-3"]);
    repository.createExpenseWithSplits.mockResolvedValue(
      makeStoredExpense({
        splitType: "EXACT",
        splits: [
          { userId: "payer-1", amountMinorUnits: 3000n },
          { userId: "user-2", amountMinorUnits: 1500n },
          { userId: "user-3", amountMinorUnits: 500n },
        ],
      }),
    );

    const service = makeService();
    const result = await service.createExpense("owner", {
      ...defaultInput,
      amountMinorUnits: 5000,
      splitType: "EXACT",
      participants: [
        { userId: "payer-1", amountMinorUnits: 3000 },
        { userId: "user-2", amountMinorUnits: 1500 },
        { userId: "user-3", amountMinorUnits: 500 },
      ],
    });

    expect(repository.createExpenseWithSplits).toHaveBeenCalledTimes(1);
    const createdData = repository.createExpenseWithSplits.mock.calls[0][0];
    expect(sumSplitAmounts(createdData.splits)).toBe(5000n);
    expect(result.splitType).toBe("EXACT");
  });

  it("throws NOT_FOUND when the group does not exist", async () => {
    repository.findGroupById.mockResolvedValue(null);

    const service = makeService();
    await expect(service.createExpense("owner", defaultInput)).rejects.toMatchObject({
      code: APP_ERRORS.GROUP_NOT_FOUND,
      statusCode: HTTP_STATUSES.NOT_FOUND,
    });
    expect(repository.createExpenseWithSplits).not.toHaveBeenCalled();
  });

  it("throws FORBIDDEN when the requester is not a group member", async () => {
    repository.findGroupById.mockResolvedValue({ id: "group-1", name: "G", createdById: "owner" });
    repository.findGroupMemberIds.mockResolvedValue(["owner", "payer-1", "user-2", "user-3"]);

    const service = makeService();
    await expect(service.createExpense("outsider", defaultInput)).rejects.toMatchObject({
      code: APP_ERRORS.NOT_GROUP_MEMBER,
      statusCode: HTTP_STATUSES.FORBIDDEN,
    });
    expect(repository.createExpenseWithSplits).not.toHaveBeenCalled();
  });

  it("throws FORBIDDEN when the payer is not a group member", async () => {
    repository.findGroupById.mockResolvedValue({ id: "group-1", name: "G", createdById: "owner" });
    repository.findGroupMemberIds.mockResolvedValue(["owner", "user-2", "user-3"]);

    const service = makeService();
    await expect(service.createExpense("owner", defaultInput)).rejects.toMatchObject({
      code: APP_ERRORS.PAYER_NOT_GROUP_MEMBER,
      statusCode: HTTP_STATUSES.FORBIDDEN,
    });
    expect(repository.createExpenseWithSplits).not.toHaveBeenCalled();
  });

  it("throws FORBIDDEN when a split participant is not a group member", async () => {
    repository.findGroupById.mockResolvedValue({ id: "group-1", name: "G", createdById: "owner" });
    repository.findGroupMemberIds.mockResolvedValue(["owner", "payer-1", "user-2"]);

    const service = makeService();
    const input = {
      ...defaultInput,
      participants: [{ userId: "payer-1" }, { userId: "intruder" }],
    };
    await expect(service.createExpense("owner", input)).rejects.toMatchObject({
      code: APP_ERRORS.SPLIT_USER_NOT_GROUP_MEMBER,
      statusCode: HTTP_STATUSES.FORBIDDEN,
    });
    expect(repository.createExpenseWithSplits).not.toHaveBeenCalled();
  });

  it("throws BAD_REQUEST when a participant is duplicated", async () => {
    repository.findGroupById.mockResolvedValue({ id: "group-1", name: "G", createdById: "owner" });
    repository.findGroupMemberIds.mockResolvedValue(["owner", "payer-1", "user-2", "user-3"]);

    const service = makeService();
    const input = {
      ...defaultInput,
      participants: [{ userId: "payer-1" }, { userId: "payer-1" }],
    };
    await expect(service.createExpense("owner", input)).rejects.toMatchObject({
      code: APP_ERRORS.DUPLICATE_SPLIT_USER,
      statusCode: HTTP_STATUSES.BAD_REQUEST,
    });
    expect(repository.createExpenseWithSplits).not.toHaveBeenCalled();
  });

  it("throws BAD_REQUEST when EXACT split amounts are too low", async () => {
    repository.findGroupById.mockResolvedValue({ id: "group-1", name: "G", createdById: "owner" });
    repository.findGroupMemberIds.mockResolvedValue(["owner", "payer-1", "user-2", "user-3"]);

    const service = makeService();
    const input = {
      ...defaultInput,
      amountMinorUnits: 5000,
      splitType: "EXACT" as const,
      participants: [
        { userId: "payer-1", amountMinorUnits: 3000 },
        { userId: "user-2", amountMinorUnits: 1000 },
        { userId: "user-3", amountMinorUnits: 500 },
      ],
    };
    await expect(service.createExpense("owner", input)).rejects.toMatchObject({
      code: APP_ERRORS.SPLIT_TOTAL_MISMATCH,
      statusCode: HTTP_STATUSES.BAD_REQUEST,
    });
    expect(repository.createExpenseWithSplits).not.toHaveBeenCalled();
  });

  it("throws BAD_REQUEST when EXACT split amounts are too high", async () => {
    repository.findGroupById.mockResolvedValue({ id: "group-1", name: "G", createdById: "owner" });
    repository.findGroupMemberIds.mockResolvedValue(["owner", "payer-1", "user-2", "user-3"]);

    const service = makeService();
    const input = {
      ...defaultInput,
      amountMinorUnits: 5000,
      splitType: "EXACT" as const,
      participants: [
        { userId: "payer-1", amountMinorUnits: 3000 },
        { userId: "user-2", amountMinorUnits: 1500 },
        { userId: "user-3", amountMinorUnits: 600 },
      ],
    };
    await expect(service.createExpense("owner", input)).rejects.toMatchObject({
      code: APP_ERRORS.SPLIT_TOTAL_MISMATCH,
      statusCode: HTTP_STATUSES.BAD_REQUEST,
    });
  });

  it("throws BAD_REQUEST when an EXACT participant is missing an amount", async () => {
    repository.findGroupById.mockResolvedValue({ id: "group-1", name: "G", createdById: "owner" });
    repository.findGroupMemberIds.mockResolvedValue(["owner", "payer-1", "user-2", "user-3"]);

    const service = makeService();
    const input = {
      ...defaultInput,
      splitType: "EXACT" as const,
      participants: [{ userId: "payer-1" }, { userId: "user-2", amountMinorUnits: 500 }],
    };
    await expect(service.createExpense("owner", input)).rejects.toMatchObject({
      code: APP_ERRORS.SPLIT_TOTAL_MISMATCH,
      statusCode: HTTP_STATUSES.BAD_REQUEST,
    });
  });
});

describe("ExpenseService.getGroupExpenses", () => {
  it("returns expenses for a member", async () => {
    repository.findGroupById.mockResolvedValue({ id: "group-1", name: "G", createdById: "owner" });
    repository.findGroupMemberIds.mockResolvedValue(["owner", "user-2"]);
    repository.findExpensesByGroupId.mockResolvedValue([
      {
        id: "expense-1",
        groupId: "group-1",
        paidById: "owner",
        description: "Dinner",
        amountMinorUnits: 1000n,
        currencyCode: "PKR",
        splitType: "EQUAL" as const,
        expenseDate: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        payer: { id: "owner", name: "Ahmed", email: "a@example.com" },
        splitCount: 2,
      },
    ]);

    const service = makeService();
    const result = await service.getGroupExpenses("owner", "group-1");

    expect(repository.findExpensesByGroupId).toHaveBeenCalledWith("group-1");
    expect(result[0].amountMinorUnits).toBe(1000);
    expect(result[0].splitCount).toBe(2);
  });

  it("throws NOT_FOUND when the group does not exist", async () => {
    repository.findGroupById.mockResolvedValue(null);

    const service = makeService();
    await expect(service.getGroupExpenses("owner", "missing")).rejects.toMatchObject({
      code: APP_ERRORS.GROUP_NOT_FOUND,
      statusCode: HTTP_STATUSES.NOT_FOUND,
    });
  });

  it("throws FORBIDDEN when the requester is not a member", async () => {
    repository.findGroupById.mockResolvedValue({ id: "group-1", name: "G", createdById: "owner" });
    repository.findGroupMemberIds.mockResolvedValue(["owner", "user-2"]);

    const service = makeService();
    await expect(service.getGroupExpenses("outsider", "group-1")).rejects.toMatchObject({
      code: APP_ERRORS.NOT_GROUP_MEMBER,
      statusCode: HTTP_STATUSES.FORBIDDEN,
    });
    expect(repository.findExpensesByGroupId).not.toHaveBeenCalled();
  });
});

describe("ExpenseService.getExpenseById", () => {
  it("returns an expense for a member of its group", async () => {
    repository.findExpenseById.mockResolvedValue(makeStoredExpense());
    repository.findGroupMemberIds.mockResolvedValue(["payer-1", "observer"]);

    const service = makeService();
    const result = await service.getExpenseById("observer", "expense-1");

    expect(result.id).toBe("expense-1");
    expect(repository.findGroupMemberIds).toHaveBeenCalledWith("group-1");
  });

  it("throws NOT_FOUND when the expense does not exist", async () => {
    repository.findExpenseById.mockResolvedValue(null);

    const service = makeService();
    await expect(service.getExpenseById("observer", "missing")).rejects.toMatchObject({
      code: APP_ERRORS.EXPENSE_NOT_FOUND,
      statusCode: HTTP_STATUSES.NOT_FOUND,
    });
  });

  it("throws FORBIDDEN when the requester is not a member of the expense's group", async () => {
    repository.findExpenseById.mockResolvedValue(makeStoredExpense({ groupId: "group-1" }));
    repository.findGroupMemberIds.mockResolvedValue(["payer-1", "another"]);

    const service = makeService();
    await expect(service.getExpenseById("outsider", "expense-1")).rejects.toMatchObject({
      code: APP_ERRORS.NOT_GROUP_MEMBER,
      statusCode: HTTP_STATUSES.FORBIDDEN,
    });
  });
});
