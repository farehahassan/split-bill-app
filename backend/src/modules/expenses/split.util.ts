/**
 * Pure, testable money-splitting helpers.
 *
 * All monetary values are handled as BIGINT minor units (paisa) so that the
 * calculation never relies on floating-point arithmetic. The sum of every
 * generated split is guaranteed to equal the expense total exactly.
 */

export interface SplitAmount {
  userId: string;
  amountMinorUnits: bigint;
}

/**
 * Splits a total into `participants.length` equal shares, distributing the
 * smallest-unit remainder to the first participants in input order.
 *
 * Invariant: the sum of the returned amounts always equals `totalMinorUnits`.
 *
 * Example: total 1000 across 3 participants → [334, 333, 333].
 */
export function calculateEqualSplits(
  totalMinorUnits: bigint,
  participantIds: string[],
): SplitAmount[] {
  const count = BigInt(participantIds.length);
  if (count === 0n) {
    return [];
  }

  const baseShare = totalMinorUnits / count;
  const remainder = Number(totalMinorUnits % count);

  return participantIds.map((userId, index) => ({
    userId,
    amountMinorUnits: baseShare + (index < remainder ? 1n : 0n),
  }));
}

/**
 * Sums split amounts. Used to verify EXACT splits reconcile with the total.
 */
export function sumSplitAmounts(splits: ReadonlyArray<{ amountMinorUnits: bigint }>): bigint {
  return splits.reduce((sum, split) => sum + split.amountMinorUnits, 0n);
}
