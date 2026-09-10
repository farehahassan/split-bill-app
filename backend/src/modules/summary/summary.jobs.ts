import { z } from "zod";

import { APP_ERRORS } from "../../constants/app-errors.js";
import { NotFoundError } from "../../errors/app.error.js";
import type { JobRegistration } from "../../queues/jobRegistry.js";
import { PermanentJobFailureError } from "../../queues/jobQueue.js";
import type { JobEnvelope } from "../../queues/job.types.js";
import { JOB_TYPES } from "../../queues/job.types.js";
import { logger } from "../../utils/logger.js";
import { SummaryRepository } from "./summary.repository.js";
import { SummaryService } from "./summary.service.js";

export const groupSummaryPayloadSchema = z
  .object({
    groupId: z.string().trim().min(1, "Group ID is required"),
  })
  .strict();

export type GroupSummaryPayload = z.infer<typeof groupSummaryPayloadSchema>;

const summaryService = new SummaryService(new SummaryRepository());

/**
 * Recomputes a group's summary snapshot. The only permanent, non-retryable
 * failure is the group no longer existing (e.g. deleted after enqueuing); any
 * other error is allowed to bubble up so the worker retries with backoff.
 */
export async function processGroupSummaryRecomputeJob(
  envelope: JobEnvelope<GroupSummaryPayload>,
): Promise<void> {
  try {
    await summaryService.recomputeGroupSummary(envelope.payload.groupId);
  } catch (error) {
    if (error instanceof NotFoundError && error.code === APP_ERRORS.GROUP_NOT_FOUND) {
      logger.info("Discarding group summary recompute: group no longer exists", {
        jobType: envelope.type,
        jobId: envelope.jobId,
        groupId: envelope.payload.groupId,
        requestId: envelope.requestId ?? null,
      });
      throw new PermanentJobFailureError(
        `Group "${envelope.payload.groupId}" no longer exists; recompute is impossible.`,
      );
    }
    throw error;
  }
}

export const groupSummaryRegistration: JobRegistration = {
  type: JOB_TYPES.GROUP_SUMMARY_RECOMPUTE,
  schema: groupSummaryPayloadSchema,
  process: (job: JobEnvelope) =>
    processGroupSummaryRecomputeJob(job as JobEnvelope<GroupSummaryPayload>),
};
