import type { Request, Response } from "express";

import { HTTP_STATUSES } from "../../constants/http-statuses.js";
import { SummaryRepository } from "./summary.repository.js";
import { SummaryService } from "./summary.service.js";

const summaryService = new SummaryService(new SummaryRepository());

export async function getGroupSummary(req: Request, res: Response): Promise<void> {
  const { id: groupId } = req.params as { id: string };

  const summary = await summaryService.getGroupSummary(req.userId!, groupId);

  res.status(HTTP_STATUSES.OK).json({
    success: true,
    data: { summary },
  });
}

export async function requestGroupSummaryRecompute(req: Request, res: Response): Promise<void> {
  const { id: groupId } = req.params as { id: string };

  const job = await summaryService.enqueueGroupSummaryRecompute(
    req.userId!,
    groupId,
    req.requestId,
  );

  res.status(HTTP_STATUSES.ACCEPTED).json({
    success: true,
    data: { job },
  });
}
