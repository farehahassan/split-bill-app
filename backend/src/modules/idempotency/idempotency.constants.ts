export const IDEMPOTENCY_RECORD_TTL_MS = 24 * 60 * 60 * 1000;

export const IDEMPOTENCY_OPERATIONS = {
  SETTLEMENT_CREATE: "SETTLEMENT_CREATE",
} as const;

export type IdempotencyOperation =
  (typeof IDEMPOTENCY_OPERATIONS)[keyof typeof IDEMPOTENCY_OPERATIONS];
