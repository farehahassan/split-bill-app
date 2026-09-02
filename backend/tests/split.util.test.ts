import { describe, it, expect } from "vitest";
import {
  calculateEqualSplits,
  sumSplitAmounts,
  type SplitAmount,
} from "../src/modules/expenses/split.util.js";

function sumSplits(splits: SplitAmount[]): bigint {
  return splits.reduce((acc, split) => acc + split.amountMinorUnits, 0n);
}

describe("calculateEqualSplits", () => {
  it.each([
    { total: 1000n, ids: ["a", "b"], expected: [500n, 500n] },
    { total: 1000n, ids: ["a", "b", "c"], expected: [334n, 333n, 333n] },
    { total: 100n, ids: ["a", "b", "c", "d", "e", "f"], expected: [17n, 17n, 17n, 17n, 16n, 16n] },
    { total: 3000n, ids: ["a", "b", "c"], expected: [1000n, 1000n, 1000n] },
    { total: 10000n, ids: ["a", "b", "c"], expected: [3334n, 3333n, 3333n] },
    { total: 1n, ids: ["a", "b", "c"], expected: [1n, 0n, 0n] },
  ])(
    "splits $total across $ids.length participants deterministically",
    ({ total, ids, expected }) => {
      const result = calculateEqualSplits(total, ids);
      expect(result.map((split) => split.amountMinorUnits)).toEqual(expected);
      // Invariant: the sum of every generated share equals the total exactly.
      expect(sumSplits(result)).toBe(total);
    },
  );

  it("preserves participant order in the result", () => {
    const result = calculateEqualSplits(1000n, ["x", "y", "z"]);
    expect(result.map((split) => split.userId)).toEqual(["x", "y", "z"]);
  });

  it("returns an empty array when there are no participants", () => {
    expect(calculateEqualSplits(1000n, [])).toEqual([]);
  });
});

describe("sumSplitAmounts", () => {
  it("sums a list of split amounts", () => {
    const splits: SplitAmount[] = [
      { userId: "a", amountMinorUnits: 3000n },
      { userId: "b", amountMinorUnits: 1500n },
      { userId: "c", amountMinorUnits: 500n },
    ];
    expect(sumSplitAmounts(splits)).toBe(5000n);
  });

  it("returns 0n for an empty split list", () => {
    expect(sumSplitAmounts([])).toBe(0n);
  });
});
