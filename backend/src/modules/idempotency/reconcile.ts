import { APP_ERRORS } from "../../constants/app-errors.js";
import { ConflictError } from "../../errors/app.error.js";

export interface IdempotencyContext {
  key: string;
  userId: string;
  requestHash: string;
}

export interface StoredIdempotencyRecord {
  userId: string;
  requestHash: string;
  status: "PENDING" | "COMPLETED";
  resourceId: string | null;
  expiresAt: Date;
}

export type ReconcileResult = "replay" | "reuse";

export function reconcileIdempotencyRecord(
  record: StoredIdempotencyRecord,
  context: IdempotencyContext,
  now: Date,
): ReconcileResult {
  if (record.userId !== context.userId) {
    throw new ConflictError(
      APP_ERRORS.IDEMPOTENCY_KEY_REUSED,
      "This Idempotency-Key was already used by a different user.",
    );
  }

  if (record.expiresAt <= now) {
    return "reuse";
  }

  if (record.requestHash !== context.requestHash) {
    throw new ConflictError(
      APP_ERRORS.IDEMPOTENCY_KEY_REUSED,
      "This Idempotency-Key was already used with a different request body.",
    );
  }

  if (record.status === "COMPLETED" && record.resourceId) {
    return "replay";
  }

  if (record.status === "COMPLETED") {
    throw new ConflictError(
      APP_ERRORS.IDEMPOTENCY_INVALID_STATE,
      "The idempotency record is in an unexpected state.",
    );
  }

  throw new ConflictError(
    APP_ERRORS.IDEMPOTENCY_CONFLICT,
    "A request with this Idempotency-Key is already being processed.",
  );
}
