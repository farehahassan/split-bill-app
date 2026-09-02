import { describe, it, expect } from "vitest";

import {
  calculateBalances,
  type ExpenseForBalance,
  type SettlementForBalance,
} from "../src/modules/settlements/balance.util.js";

function expense(
  paidById: string,
  amountMinorUnits: bigint,
  splits: Array<{ userId: string; amountMinorUnits: bigint }>,
): ExpenseForBalance {
  return { paidById, amountMinorUnits, splits };
}

function settlement(
  payerId: string,
  payeeId: string,
  amountMinorUnits: bigint,
): SettlementForBalance {
  return { payerId, payeeId, amountMinorUnits };
}

describe("calculateBalances", () => {
  it("handles a single expense with the payer included in the split", () => {
    const balances = calculateBalances(
      [
        expense("alice", 300n, [
          { userId: "alice", amountMinorUnits: 100n },
          { userId: "bob", amountMinorUnits: 100n },
          { userId: "carol", amountMinorUnits: 100n },
        ]),
      ],
      [],
    );

    expect(balances.get("alice")).toBe(200n);
    expect(balances.get("bob")).toBe(-100n);
    expect(balances.get("carol")).toBe(-100n);
  });

  it("handles a single expense with the payer excluded from the split", () => {
    const balances = calculateBalances(
      [
        expense("alice", 200n, [
          { userId: "bob", amountMinorUnits: 100n },
          { userId: "carol", amountMinorUnits: 100n },
        ]),
      ],
      [],
    );

    expect(balances.get("alice")).toBe(200n);
    expect(balances.get("bob")).toBe(-100n);
    expect(balances.get("carol")).toBe(-100n);
  });

  it("handles multiple participants", () => {
    const balances = calculateBalances(
      [
        expense("alice", 400n, [
          { userId: "alice", amountMinorUnits: 100n },
          { userId: "bob", amountMinorUnits: 100n },
          { userId: "carol", amountMinorUnits: 100n },
          { userId: "dave", amountMinorUnits: 100n },
        ]),
      ],
      [],
    );

    expect(balances.get("alice")).toBe(300n);
    expect(balances.get("bob")).toBe(-100n);
    expect(balances.get("carol")).toBe(-100n);
    expect(balances.get("dave")).toBe(-100n);
  });

  it("handles multiple expenses involving the same users", () => {
    const balances = calculateBalances(
      [
        expense("alice", 300n, [
          { userId: "alice", amountMinorUnits: 100n },
          { userId: "bob", amountMinorUnits: 200n },
        ]),
        expense("bob", 200n, [
          { userId: "alice", amountMinorUnits: 100n },
          { userId: "bob", amountMinorUnits: 100n },
        ]),
      ],
      [],
    );

    // alice: +300 -100 (exp1) -100 (exp2) = +100
    // bob: +200 (exp2 payer) -200 (exp1 split) -100 (exp2 split) = -100
    expect(balances.get("alice")).toBe(100n);
    expect(balances.get("bob")).toBe(-100n);
  });

  it("applies multiple settlements", () => {
    const balances = calculateBalances(
      [],
      [settlement("bob", "alice", 50n), settlement("carol", "alice", 30n)],
    );

    // bob (payer) +50, carol (payer) +30, alice (payee of both) -80
    expect(balances.get("bob")).toBe(50n);
    expect(balances.get("alice")).toBe(-80n);
    expect(balances.get("carol")).toBe(30n);
  });

  it("nets combined expenses and settlements", () => {
    const balances = calculateBalances(
      [
        expense("alice", 300n, [
          { userId: "alice", amountMinorUnits: 100n },
          { userId: "bob", amountMinorUnits: 100n },
          { userId: "carol", amountMinorUnits: 100n },
        ]),
      ],
      [settlement("bob", "alice", 40n)],
    );

    // alice: +300 (payer) -100 (split) -40 (payee) = +160
    // bob: -100 (split) +40 (payer) = -60
    // carol: -100
    expect(balances.get("alice")).toBe(160n);
    expect(balances.get("bob")).toBe(-60n);
    expect(balances.get("carol")).toBe(-100n);
  });

  it("includes a user only when they appear in a record", () => {
    const balances = calculateBalances(
      [expense("alice", 100n, [{ userId: "bob", amountMinorUnits: 100n }])],
      [],
    );

    expect(balances.has("alice")).toBe(true);
    expect(balances.has("bob")).toBe(true);
    expect(balances.has("nobody")).toBe(false);
  });

  it("uses bigint precision and never fractional values", () => {
    const balances = calculateBalances(
      [
        expense("alice", 1000n, [
          { userId: "alice", amountMinorUnits: 334n },
          { userId: "bob", amountMinorUnits: 333n },
          { userId: "carol", amountMinorUnits: 333n },
        ]),
      ],
      [],
    );

    expect(balances.get("alice")).toBe(666n);
    expect(Number(balances.get("alice"))).toBe(666);
    expect(typeof balances.get("alice")).toBe("bigint");
  });

  it("returns an empty map for no records", () => {
    const balances = calculateBalances([], []);
    expect(balances.size).toBe(0);
  });

  it("satisfies the invariant that all balances sum to zero", () => {
    const expenses: ExpenseForBalance[] = [
      expense("alice", 1000n, [
        { userId: "alice", amountMinorUnits: 334n },
        { userId: "bob", amountMinorUnits: 333n },
        { userId: "carol", amountMinorUnits: 333n },
      ]),
      expense("bob", 600n, [
        { userId: "alice", amountMinorUnits: 200n },
        { userId: "bob", amountMinorUnits: 200n },
        { userId: "carol", amountMinorUnits: 200n },
      ]),
      expense("carol", 300n, [{ userId: "dave", amountMinorUnits: 300n }]),
    ];
    const settlements: SettlementForBalance[] = [
      settlement("bob", "alice", 100n),
      settlement("dave", "carol", 50n),
    ];

    const balances = calculateBalances(expenses, settlements);
    const sum = Array.from(balances.values()).reduce((acc, value) => acc + value, 0n);
    expect(sum).toBe(0n);
  });

  it("yields a zero final balance for fully settled users", () => {
    // alice pays 100, bob covers 100 -> mutually settled by a 100 settlement.
    const balances = calculateBalances(
      [expense("alice", 100n, [{ userId: "bob", amountMinorUnits: 100n }])],
      [settlement("bob", "alice", 100n)],
    );

    // alice: +100 (payer) -100 (payee) = 0; bob: -100 (split) +100 (payer) = 0
    expect(balances.get("alice")).toBe(0n);
    expect(balances.get("bob")).toBe(0n);
    const sum = Array.from(balances.values()).reduce((acc, value) => acc + value, 0n);
    expect(sum).toBe(0n);
  });
});
