import { describe, it, expect } from "vitest";

import { createRequestHash } from "../src/modules/idempotency/request-hash.js";
import {
  reconcileIdempotencyRecord,
  type IdempotencyContext,
  type StoredIdempotencyRecord,
} from "../src/modules/idempotency/reconcile.js";
import { APP_ERRORS } from "../src/constants/app-errors.js";

const context: IdempotencyContext = {
  key: "key-12345678",
  userId: "alice-1",
  requestHash: "hash-of-request-a",
};

function storedRecord(overrides: Partial<StoredIdempotencyRecord> = {}): StoredIdempotencyRecord {
  return {
    userId: "alice-1",
    requestHash: "hash-of-request-a",
    status: "COMPLETED",
    resourceId: "settlement-1",
    expiresAt: new Date(Date.now() + 60_000),
    ...overrides,
  };
}

describe("createRequestHash", () => {
  it("produces the same hash for the same payload", () => {
    const payload = {
      groupId: "group-1",
      payerId: "bob-1",
      payeeId: "alice-1",
      amountMinorUnits: 500,
    };
    expect(createRequestHash(payload)).toBe(createRequestHash(payload));
  });

  it("produces different hashes for different amounts", () => {
    const base = { groupId: "group-1", payerId: "bob-1", payeeId: "alice-1" };
    expect(createRequestHash({ ...base, amountMinorUnits: 500 })).not.toBe(
      createRequestHash({ ...base, amountMinorUnits: 900 }),
    );
  });

  it("produces different hashes for different groups", () => {
    const base = { payerId: "bob-1", payeeId: "alice-1", amountMinorUnits: 500 };
    expect(createRequestHash({ ...base, groupId: "group-1" })).not.toBe(
      createRequestHash({ ...base, groupId: "group-2" }),
    );
  });
});

describe("reconcileIdempotencyRecord", () => {
  it("returns replay for a completed record with a matching hash", () => {
    expect(reconcileIdempotencyRecord(storedRecord(), context, new Date())).toBe("replay");
  });

  it("returns reuse for an expired record with a matching hash", () => {
    const expired = storedRecord({ expiresAt: new Date(Date.now() - 1000) });
    expect(reconcileIdempotencyRecord(expired, context, new Date())).toBe("reuse");
  });

  it("rejects a key reused by a different user", () => {
    expect(() =>
      reconcileIdempotencyRecord(storedRecord({ userId: "owner-1" }), context, new Date()),
    ).toThrowError(
      expect.objectContaining({
        code: APP_ERRORS.IDEMPOTENCY_KEY_REUSED,
      }),
    );
  });

  it("rejects a key reused with a different request payload", () => {
    expect(() =>
      reconcileIdempotencyRecord(
        storedRecord({ requestHash: "hash-of-request-b" }),
        context,
        new Date(),
      ),
    ).toThrowError(
      expect.objectContaining({
        code: APP_ERRORS.IDEMPOTENCY_KEY_REUSED,
      }),
    );
  });

  it("rejects an in-progress pending record", () => {
    expect(() =>
      reconcileIdempotencyRecord(storedRecord({ status: "PENDING" }), context, new Date()),
    ).toThrowError(
      expect.objectContaining({
        code: APP_ERRORS.IDEMPOTENCY_CONFLICT,
      }),
    );
  });

  it("rejects a completed record without a resource reference", () => {
    expect(() =>
      reconcileIdempotencyRecord(storedRecord({ resourceId: null }), context, new Date()),
    ).toThrowError(
      expect.objectContaining({
        code: APP_ERRORS.IDEMPOTENCY_INVALID_STATE,
      }),
    );
  });
});
