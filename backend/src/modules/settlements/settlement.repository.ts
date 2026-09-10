import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { APP_ERRORS } from "../../constants/app-errors.js";
import { ConflictError } from "../../errors/app.error.js";
import {
  IDEMPOTENCY_OPERATIONS,
  IDEMPOTENCY_RECORD_TTL_MS,
} from "../idempotency/idempotency.constants.js";
import { reconcileIdempotencyRecord, type IdempotencyContext } from "../idempotency/reconcile.js";
import type { ExpenseForBalance, SettlementForBalance } from "./balance.util.js";
import { createActivityEvent, type ActivityEventInput } from "../activity/activity.repository.js";

export interface SafeUser {
  id: string;
  name: string;
  email: string;
}

export interface GroupMemberUser {
  userId: string;
  user: SafeUser;
}

export interface SettlementCreateData {
  groupId: string;
  payerId: string;
  payeeId: string;
  amountMinorUnits: bigint;
  currencyCode: string;
  settledAt: Date;
}

export interface SettlementRecord {
  id: string;
  groupId: string;
  payerId: string;
  payeeId: string;
  amountMinorUnits: bigint;
  currencyCode: string;
  settledAt: Date;
  createdAt: Date;
  updatedAt: Date;
  payer: SafeUser;
  payee: SafeUser;
}

const safeUserSelect = {
  id: true,
  name: true,
  email: true,
} satisfies Prisma.UserSelect;

const settlementInclude = {
  payer: { select: safeUserSelect },
  payee: { select: safeUserSelect },
} satisfies Prisma.SettlementInclude;

export class SettlementRepository {
  findGroupById(id: string): Promise<{ id: string; name: string; createdById: string } | null> {
    return prisma.group.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        createdById: true,
      },
    });
  }

  /**
   * Returns the group's members together with their safe public user fields.
   * Used to build the balances response (including zero-balance members) and to
   * authorize the requester without issuing a separate membership query.
   */
  async findGroupMembers(groupId: string): Promise<GroupMemberUser[]> {
    return prisma.groupMember.findMany({
      where: { groupId },
      select: {
        userId: true,
        user: { select: safeUserSelect },
      },
      orderBy: { createdAt: "asc" },
    });
  }

  /**
   * Fetches every expense (and its splits) belonging to the group as the raw
   * input expected by the balance calculation.
   */
  async findExpensesForBalances(groupId: string): Promise<ExpenseForBalance[]> {
    const expenses = await prisma.expense.findMany({
      where: { groupId },
      select: {
        paidById: true,
        amountMinorUnits: true,
        splits: {
          select: {
            userId: true,
            amountMinorUnits: true,
          },
        },
      },
    });

    return expenses.map((expense) => ({
      paidById: expense.paidById,
      amountMinorUnits: expense.amountMinorUnits,
      splits: expense.splits.map((split) => ({
        userId: split.userId,
        amountMinorUnits: split.amountMinorUnits,
      })),
    }));
  }

  /**
   * Fetches every settlement belonging to the group as the raw input expected
   * by the balance calculation.
   */
  async findSettlementsForBalances(groupId: string): Promise<SettlementForBalance[]> {
    const settlements = await prisma.settlement.findMany({
      where: { groupId },
      select: {
        payerId: true,
        payeeId: true,
        amountMinorUnits: true,
      },
    });

    return settlements;
  }

  /**
   * Creates a settlement and its settlement-added activity event atomically,
   * protected against duplicates by the idempotency record.
   */
  async createSettlement(
    data: SettlementCreateData,
    idempotency: IdempotencyContext,
    activity: ActivityEventInput,
  ): Promise<SettlementRecord> {
    try {
      return await prisma.$transaction(async (tx) => {
        const existing = await tx.idempotencyRecord.findUnique({
          where: { key: idempotency.key },
        });

        if (existing) {
          const outcome = reconcileIdempotencyRecord(existing, idempotency, new Date());
          if (outcome === "replay") {
            return this.replaySettlement(tx, existing);
          }
          await tx.idempotencyRecord.deleteMany({ where: { id: existing.id } });
        }

        const claim = await tx.idempotencyRecord.create({
          data: {
            key: idempotency.key,
            userId: idempotency.userId,
            requestHash: idempotency.requestHash,
            status: "PENDING",
            operation: IDEMPOTENCY_OPERATIONS.SETTLEMENT_CREATE,
            scope: data.groupId,
            expiresAt: new Date(Date.now() + IDEMPOTENCY_RECORD_TTL_MS),
          },
        });

        const settlement = await tx.settlement.create({
          data: {
            groupId: data.groupId,
            payerId: data.payerId,
            payeeId: data.payeeId,
            amountMinorUnits: data.amountMinorUnits,
            currencyCode: data.currencyCode,
            settledAt: data.settledAt,
          },
          include: settlementInclude,
        });

        await createActivityEvent(tx, {
          groupId: settlement.groupId,
          userId: activity.userId,
          type: activity.type,
          message: activity.message,
          amountMinorUnits: settlement.amountMinorUnits,
          currencyCode: settlement.currencyCode,
          occurredAt: settlement.createdAt,
        });

        await tx.idempotencyRecord.update({
          where: { id: claim.id },
          data: { status: "COMPLETED", resourceId: settlement.id },
        });

        return settlement;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const existing = await prisma.idempotencyRecord.findUnique({
          where: { key: idempotency.key },
        });
        if (existing) {
          const outcome = reconcileIdempotencyRecord(existing, idempotency, new Date());
          if (outcome === "replay") {
            return this.replaySettlement(prisma, existing);
          }
        }
        throw new ConflictError(
          APP_ERRORS.IDEMPOTENCY_CONFLICT,
          "A request with this Idempotency-Key is already being processed.",
        );
      }
      throw error;
    }
  }

  findSettlementById(id: string): Promise<SettlementRecord | null> {
    return prisma.settlement.findUnique({
      where: { id },
      include: settlementInclude,
    });
  }

  /**
   * Returns the group's settlements, newest first, with sender and receiver.
   *
   * Without `pagination` the full list is returned (legacy behavior). When
   * pagination is supplied the query applies skip/take at the database level,
   * adds an `id` tie-breaker for a deterministic page order, and returns the
   * matching total for the pagination metadata.
   */
  async findSettlementsByGroupId(
    groupId: string,
    pagination?: { page: number; limit: number },
  ): Promise<{ settlements: SettlementRecord[]; total?: number }> {
    if (!pagination) {
      const settlements = await prisma.settlement.findMany({
        where: { groupId },
        orderBy: { settledAt: "desc" },
        include: settlementInclude,
      });
      return { settlements };
    }

    const [settlements, total] = await Promise.all([
      prisma.settlement.findMany({
        where: { groupId },
        orderBy: [{ settledAt: "desc" }, { id: "asc" }],
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
        include: settlementInclude,
      }),
      prisma.settlement.count({ where: { groupId } }),
    ]);

    return { settlements, total };
  }

  private async replaySettlement(
    client: Pick<Prisma.TransactionClient, "settlement">,
    record: { resourceId: string | null },
  ): Promise<SettlementRecord> {
    if (!record.resourceId) {
      throw new ConflictError(
        APP_ERRORS.IDEMPOTENCY_INVALID_STATE,
        "The idempotency record is in an unexpected state.",
      );
    }

    const settlement = await client.settlement.findUnique({
      where: { id: record.resourceId },
      include: settlementInclude,
    });

    if (!settlement) {
      throw new ConflictError(
        APP_ERRORS.IDEMPOTENCY_INVALID_STATE,
        "The cached resource for this Idempotency-Key no longer exists.",
      );
    }

    return settlement;
  }
}
