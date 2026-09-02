import { APP_ERRORS } from "../../constants/app-errors.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../errors/app.error.js";
import { SettlementRepository, type SettlementRecord } from "./settlement.repository.js";
import { calculateBalances } from "./balance.util.js";

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

export class SettlementService {
  constructor(private repository: SettlementRepository) {}

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

    const settlement = await this.repository.createSettlement({
      groupId,
      payerId: input.payerId,
      payeeId: input.payeeId,
      amountMinorUnits,
      currencyCode: "PKR",
      settledAt: new Date(),
    });

    return this.toDto(settlement);
  }

  async getGroupSettlements(requesterId: string, groupId: string): Promise<SettlementDto[]> {
    const group = await this.repository.findGroupById(groupId);
    if (!group) {
      throw new NotFoundError(APP_ERRORS.GROUP_NOT_FOUND, "Group not found.");
    }

    await this.assertMemberOfGroup(requesterId, groupId);

    const settlements = await this.repository.findSettlementsByGroupId(groupId);
    return settlements.map((settlement) => this.toDto(settlement));
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
