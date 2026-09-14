import { describe, it, expect, vi, beforeEach } from "vitest";

import { SettlementService } from "../src/modules/settlements/settlement.service.js";
import { SettlementRepository } from "../src/modules/settlements/settlement.repository.js";
import { APP_ERRORS } from "../src/constants/app-errors.js";
import { HTTP_STATUSES } from "../src/constants/http-statuses.js";
import { ConflictError } from "../src/errors/app.error.js";
import { DistributedLock, DistributedLockConflictError } from "../src/redis/distributedLock.js";
import type { GroupMemberUser } from "../src/modules/settlements/settlement.repository.js";

type WithLock = Pick<DistributedLock, "withLock">;

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

const repository = vi.mocked(new SettlementRepository());

function members(ids: string[]): GroupMemberUser[] {
  return ids.map((userId) => ({
    userId,
    user: { id: userId, name: `User ${userId}`, email: `${userId}@example.com` },
  }));
}

const group = { id: "group-1", name: "Trip to Naran", createdById: "owner-1" };
const idempotency = { key: "settlement-create-key", userId: "owner-1", requestHash: "hash" };

const input = {
  groupId: "group-1",
  payerId: "bob",
  payeeId: "alice",
  amountMinorUnits: 500,
};

function storedSettlement() {
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
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  repository.findGroupById.mockResolvedValue(group);
  repository.findGroupMembers.mockResolvedValue(members(["owner-1", "alice", "bob"]));
  repository.createSettlement.mockResolvedValue(storedSettlement());
});

function makeService(lock: WithLock): SettlementService {
  return new SettlementService(repository, lock);
}

describe("SettlementService.createSettlement with the distributed lock", () => {
  it("creates the settlement while holding a group-scoped lock", async () => {
    const acquiredKeys: string[] = [];
    const lock: WithLock = {
      withLock: async (key, operation) => {
        acquiredKeys.push(key);
        return operation();
      },
    };
    const service = makeService(lock);

    const settlement = await service.createSettlement("owner-1", input, idempotency);

    expect(acquiredKeys).toEqual(["lock:settlement:group:group-1"]);
    expect(repository.createSettlement).toHaveBeenCalledTimes(1);
    expect(settlement.id).toBe("settlement-1");
  });

  it("maps a held lock to a 409 SETTLEMENT_CONCURRENT_LOCKED conflict", async () => {
    const lock: WithLock = {
      withLock: async (key) => {
        throw new DistributedLockConflictError(key);
      },
    };
    const service = makeService(lock);

    await expect(service.createSettlement("owner-1", input, idempotency)).rejects.toMatchObject(
      expect.objectContaining({
        name: "ConflictError",
        statusCode: HTTP_STATUSES.CONFLICT,
        code: APP_ERRORS.SETTLEMENT_CONCURRENT_LOCKED,
      }),
    );
    expect(repository.createSettlement).not.toHaveBeenCalled();
  });

  it("maps the infra conflict into a domain ConflictError (never leaks the infra error)", async () => {
    const lock: WithLock = {
      withLock: async (key) => {
        throw new DistributedLockConflictError(key);
      },
    };
    const service = makeService(lock);

    try {
      await service.createSettlement("owner-1", input, idempotency);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictError);
      expect(error).not.toBeInstanceOf(DistributedLockConflictError);
    }
  });

  it("still creates the settlement when Redis is unavailable (degraded)", async () => {
    // Mimics the production degraded path: the lock runs the operation
    // uncoordinated after the Redis backend threw during acquisition.
    const lock: WithLock = {
      withLock: async (_key, operation) => operation(),
    };
    const service = makeService(lock);

    const settlement = await service.createSettlement("owner-1", input, idempotency);

    expect(settlement.id).toBe("settlement-1");
    expect(repository.createSettlement).toHaveBeenCalledTimes(1);
  });

  it("does not create a settlement when Redis is down AND the operation throws", async () => {
    const lock: WithLock = {
      withLock: async (_key, operation) => operation(),
    };
    repository.createSettlement.mockRejectedValueOnce(new Error("db failure"));

    const service = makeService(lock);

    await expect(service.createSettlement("owner-1", input, idempotency)).rejects.toThrow(
      "db failure",
    );
  });

  it("keeps domain validation errors intact (no lock interaction for invalid members)", async () => {
    repository.findGroupMembers.mockResolvedValueOnce(members(["owner-1"]));
    const lock: WithLock = {
      withLock: vi.fn(async (_key, operation) => operation()),
    };
    const service = makeService(lock);

    await expect(service.createSettlement("owner-1", input, idempotency)).rejects.toMatchObject({
      statusCode: HTTP_STATUSES.FORBIDDEN,
      code: APP_ERRORS.SETTLEMENT_PAYER_NOT_GROUP_MEMBER,
    });
    expect(lock.withLock).not.toHaveBeenCalled();
  });
});
