import type { Request, Response } from "express";

import { HTTP_STATUSES } from "../../constants/http-statuses.js";
import type { PaginationQuery } from "../../utils/pagination.js";
import { createRequestHash } from "../idempotency/request-hash.js";
import { SettlementService } from "./settlement.service.js";
import { SettlementRepository } from "./settlement.repository.js";

const settlementService = new SettlementService(new SettlementRepository());

export async function getGroupBalances(req: Request, res: Response): Promise<void> {
  const groupId = (req.params as { id: string }).id;
  const balances = await settlementService.getGroupBalances(req.userId!, groupId);
  res.status(HTTP_STATUSES.OK).json({ success: true, data: { balances } });
}

export async function createSettlement(req: Request, res: Response): Promise<void> {
  const groupId = (req.params as { id: string }).id;
  const body = req.body as {
    payerId: string;
    payeeId: string;
    amountMinorUnits: number;
  };

  const requestHash = createRequestHash({
    groupId,
    payerId: body.payerId,
    payeeId: body.payeeId,
    amountMinorUnits: body.amountMinorUnits,
  });

  const settlement = await settlementService.createSettlement(
    req.userId!,
    {
      groupId,
      payerId: body.payerId,
      payeeId: body.payeeId,
      amountMinorUnits: body.amountMinorUnits,
    },
    { key: req.idempotencyKey!, userId: req.userId!, requestHash },
  );

  res.status(HTTP_STATUSES.CREATED).json({ success: true, data: { settlement } });
}

export async function getGroupSettlements(req: Request, res: Response): Promise<void> {
  const groupId = (req.params as { id: string }).id;
  const query = req.query as PaginationQuery;

  const pagination =
    query.page !== undefined || query.limit !== undefined
      ? { page: query.page ?? 1, limit: query.limit ?? 20 }
      : undefined;

  const result = await settlementService.getGroupSettlements(req.userId!, groupId, pagination);

  const payload: Record<string, unknown> = {
    success: true,
    data: { settlements: result.settlements },
  };
  if (result.pagination) {
    payload.pagination = result.pagination;
  }

  res.status(HTTP_STATUSES.OK).json(payload);
}

export async function getSettlementById(req: Request, res: Response): Promise<void> {
  const settlementId = (req.params as { id: string }).id;
  const settlement = await settlementService.getSettlementById(req.userId!, settlementId);
  res.status(HTTP_STATUSES.OK).json({ success: true, data: { settlement } });
}
