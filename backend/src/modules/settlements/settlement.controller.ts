import type { Request, Response } from "express";

import { HTTP_STATUSES } from "../../constants/http-statuses.js";
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

  const settlement = await settlementService.createSettlement(req.userId!, {
    groupId,
    payerId: body.payerId,
    payeeId: body.payeeId,
    amountMinorUnits: body.amountMinorUnits,
  });

  res.status(HTTP_STATUSES.CREATED).json({ success: true, data: { settlement } });
}

export async function getGroupSettlements(req: Request, res: Response): Promise<void> {
  const groupId = (req.params as { id: string }).id;
  const settlements = await settlementService.getGroupSettlements(req.userId!, groupId);
  res.status(HTTP_STATUSES.OK).json({ success: true, data: { settlements } });
}

export async function getSettlementById(req: Request, res: Response): Promise<void> {
  const settlementId = (req.params as { id: string }).id;
  const settlement = await settlementService.getSettlementById(req.userId!, settlementId);
  res.status(HTTP_STATUSES.OK).json({ success: true, data: { settlement } });
}
