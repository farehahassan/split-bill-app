/**
 * Pure, testable balance-calculation helpers.
 *
 * All monetary values are handled as BIGINT minor units (paisa) so the
 * calculation never relies on floating-point arithmetic.
 *
 * A positive balance means the member is a net creditor (owed money by the
 * group); a negative balance means the member is a net debtor (owes money).
 * The sum of every member's balance for a group is always exactly zero.
 */

export interface SplitForBalance {
  userId: string;
  amountMinorUnits: bigint;
}

export interface ExpenseForBalance {
  paidById: string;
  amountMinorUnits: bigint;
  splits: SplitForBalance[];
}

export interface SettlementForBalance {
  payerId: string;
  payeeId: string;
  amountMinorUnits: bigint;
}

/**
 * Computes net balances from a group's source financial records.
 *
 * For each expense:
 *   - the payer is credited the full expense amount
 *   - every split participant is debited their split amount
 * For each settlement:
 *   - the sender (payer) is credited the settlement amount
 *   - the receiver (payee) is debited the settlement amount
 *
 * Contributions to the returned map are keyed by user id and default to zero
 * for users that never appear in any record.
 *
 * Invariant: the sum of all balances is exactly zero.
 */
export function calculateBalances(
  expenses: ReadonlyArray<ExpenseForBalance>,
  settlements: ReadonlyArray<SettlementForBalance>,
): Map<string, bigint> {
  const balances = new Map<string, bigint>();

  const credit = (userId: string, amount: bigint): void => {
    balances.set(userId, (balances.get(userId) ?? 0n) + amount);
  };

  for (const expense of expenses) {
    credit(expense.paidById, expense.amountMinorUnits);
    for (const split of expense.splits) {
      credit(split.userId, -split.amountMinorUnits);
    }
  }

  for (const settlement of settlements) {
    credit(settlement.payerId, settlement.amountMinorUnits);
    credit(settlement.payeeId, -settlement.amountMinorUnits);
  }

  return balances;
}
