import { APP_ERRORS } from "../../constants/app-errors.js";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../errors/app.error.js";
import { loadEnv } from "../../config/env.js";
import { DistributedLock, DistributedLockConflictError } from "../../redis/distributedLock.js";
import { getRedis } from "../../redis/redisClient.js";
import { METRIC, metrics } from "../../metrics/registry.js";
import type { IdempotencyContext } from "../idempotency/reconcile.js";
import { SettlementRepository, type SettlementRecord } from "./settlement.repository.js";
import { calculateBalances } from "./balance.util.js";

/**
 * Lock key convention for settlement creation. Group-scoped so concurrent
 * settlements in the same group are serialized (they mutate one shared balance
 * book), while settlements in different groups never contend. The prefix is
 * part of the documented "lock:" keyspace.
 */
function settlementLockKey(groupId: string): string {
  return `lock:settlement:group:${groupId}`;
}

export interface BalanceDto {
  userId: string;
  name: string;
  email: string;
  amountMinorUnits: number;
}

export interface SettlementDto {
  id: string;
  groupId: string;
  payerId: string;
  payeeId: string;
  amountMinorUnits: number;
  currencyCode: string;
  settledAt: Date;
  createdAt: Date;
  updatedAt: Date;
  payer: { id: string; name: string; email: string };
  payee: { id: string; name: string; email: string };
}

export interface CreateSettlementInput {
  groupId: string;
  payerId: string;
  payeeId: string;
  amountMinorUnits: number;
}

export interface SettlementListPage {
  settlements: SettlementDto[];
  pagination?: { page: number; limit: number; total: number };
}

export class SettlementService {
  constructor(
    private repository: SettlementRepository,
    private lock: Pick<DistributedLock, "withLock"> = new DistributedLock(
      getRedis(),
      loadEnv().DISTRIBUTED_LOCK_TTL_MS,
    ),
  ) {}

  async getGroupBalances(requesterId: string, groupId: string): Promise<BalanceDto[]> {
    const group = await this.repository.findGroupById(groupId);
    if (!group) {
      throw new NotFoundError(APP_ERRORS.GROUP_NOT_FOUND, "Group not found.");
    }

    const members = await this.repository.findGroupMembers(groupId);
    const memberIds = members.map((member) => member.userId);
    if (!memberIds.includes(requesterId)) {
      throw new ForbiddenError(APP_ERRORS.NOT_GROUP_MEMBER, "You are not a member of this group.");
    }

    const expenses = await this.repository.findExpensesForBalances(groupId);
    const settlements = await this.repository.findSettlementsForBalances(groupId);
    const balances = calculateBalances(expenses, settlements);

    return members.map((member) => ({
      userId: member.userId,
      name: member.user.name,
      email: member.user.email,
      amountMinorUnits: this.toNum(balances.get(member.userId) ?? 0n),
    }));
  }

  async createSettlement(
    requesterId: string,
    input: CreateSettlementInput,
    idempotency: IdempotencyContext,
  ): Promise<SettlementDto> {
    const { groupId } = input;
    const amountMinorUnits = BigInt(input.amountMinorUnits);

    const group = await this.repository.findGroupById(groupId);
    if (!group) {
      throw new NotFoundError(APP_ERRORS.GROUP_NOT_FOUND, "Group not found.");
    }

    const memberIds = (await this.repository.findGroupMembers(groupId)).map(
      (member) => member.userId,
    );
    if (!memberIds.includes(requesterId)) {
      throw new ForbiddenError(APP_ERRORS.NOT_GROUP_MEMBER, "You are not a member of this group.");
    }

    if (input.payerId === input.payeeId) {
      throw new BadRequestError(
        APP_ERRORS.SETTLEMENT_USERS_MUST_DIFFER,
        "The settlement sender and receiver must be different users.",
      );
    }

    if (!memberIds.includes(input.payerId)) {
      throw new ForbiddenError(
        APP_ERRORS.SETTLEMENT_PAYER_NOT_GROUP_MEMBER,
        "The settlement sender must be a member of the group.",
      );
    }

    if (!memberIds.includes(input.payeeId)) {
      throw new ForbiddenError(
        APP_ERRORS.SETTLEMENT_PAYEE_NOT_GROUP_MEMBER,
        "The settlement receiver must be a member of the group.",
      );
    }

    try {
      const settlement = await this.lock.withLock(settlementLockKey(groupId), () =>
        this.repository.createSettlement(
          {
            groupId,
            payerId: input.payerId,
            payeeId: input.payeeId,
            amountMinorUnits,
            currencyCode: "PKR",
            settledAt: new Date(),
          },
          idempotency,
          {
            userId: requesterId,
            type: "SETTLEMENT_ADDED",
            message: "recorded a settlement",
          },
        ),
      );

      metrics.increment(METRIC.settlementsCreatedTotal);

      return this.toDto(settlement);
    } catch (error) {
      if (error instanceof DistributedLockConflictError) {
        throw new ConflictError(
          APP_ERRORS.SETTLEMENT_CONCURRENT_LOCKED,
          "Another settlement for this group is being processed. Please retry shortly.",
        );
      }
      throw error;
    }
  }

  /**
   * Lists a group's settlements. Pagination is opt-in: the response only
   * carries pagination metadata when the caller supplied `page`/`limit`,
   * preserving the legacy "return everything" envelope for every other call.
   */
  async getGroupSettlements(
    requesterId: string,
    groupId: string,
    pagination?: { page: number; limit: number },
  ): Promise<SettlementListPage> {
    const group = await this.repository.findGroupById(groupId);
    if (!group) {
      throw new NotFoundError(APP_ERRORS.GROUP_NOT_FOUND, "Group not found.");
    }

    await this.assertMemberOfGroup(requesterId, groupId);

    const { settlements, total } = await this.repository.findSettlementsByGroupId(
      groupId,
      pagination,
    );
    const list = settlements.map((settlement) => this.toDto(settlement));

    if (pagination) {
      return {
        settlements: list,
        pagination: { page: pagination.page, limit: pagination.limit, total: total! },
      };
    }
    return { settlements: list };
  }

  async getSettlementById(requesterId: string, settlementId: string): Promise<SettlementDto> {
    const settlement = await this.repository.findSettlementById(settlementId);
    if (!settlement) {
      throw new NotFoundError(APP_ERRORS.SETTLEMENT_NOT_FOUND, "Settlement not found.");
    }

    await this.assertMemberOfGroup(requesterId, settlement.groupId);

    return this.toDto(settlement);
  }

  private async assertMemberOfGroup(requesterId: string, groupId: string): Promise<void> {
    const memberIds = (await this.repository.findGroupMembers(groupId)).map(
      (member) => member.userId,
    );
    if (!memberIds.includes(requesterId)) {
      throw new ForbiddenError(APP_ERRORS.NOT_GROUP_MEMBER, "You are not a member of this group.");
    }
  }

  private toNum(value: bigint): number {
    return Number(value);
  }

  private toDto(settlement: SettlementRecord): SettlementDto {
    return {
      id: settlement.id,
      groupId: settlement.groupId,
      payerId: settlement.payerId,
      payeeId: settlement.payeeId,
      amountMinorUnits: this.toNum(settlement.amountMinorUnits),
      currencyCode: settlement.currencyCode,
      settledAt: settlement.settledAt,
      createdAt: settlement.createdAt,
      updatedAt: settlement.updatedAt,
      payer: settlement.payer,
      payee: settlement.payee,
    };
  }
}
