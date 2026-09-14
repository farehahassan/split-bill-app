import { APP_ERRORS } from "../../constants/app-errors.js";
import { HTTP_STATUSES } from "../../constants/http-statuses.js";
import { AppError, ForbiddenError, NotFoundError } from "../../errors/app.error.js";
import { JOB_TYPES } from "../../queues/job.types.js";
import { getJobQueue, type JobQueue } from "../../queues/jobQueue.js";
import { METRIC, metrics } from "../../metrics/registry.js";
import { logger } from "../../utils/logger.js";
import { SummaryRepository, type GroupSummaryRecord } from "./summary.repository.js";

export interface GroupSummaryDto {
  id: string;
  groupId: string;
  totalSpentMinorUnits: number;
  expenseCount: number;
  settlementCount: number;
  memberCount: number;
  currencyCode: string;
  computedAt: Date;
}

export interface QueuedJobDto {
  jobId: string;
  type: string;
  status: "queued";
}

/**
 * Queues a group-summary recompute job on the shared Redis-backed queue. The
 * payload carries only the group id — never sensitive data. Exposed as a
 * standalone so both the service and tests share one enqueue path.
 */
export async function enqueueGroupSummaryRecomputeJob(
  groupId: string,
  options: { requestId?: string } = {},
  queue: JobQueue = getJobQueue(),
): Promise<QueuedJobDto> {
  const envelope = await queue.enqueue(
    JOB_TYPES.GROUP_SUMMARY_RECOMPUTE,
    { groupId },
    { requestId: options.requestId },
  );
  return {
    jobId: envelope.jobId,
    type: envelope.type,
    status: "queued",
  };
}

export class SummaryService {
  constructor(private repository: SummaryRepository) {}

  /**
   * Recomputes and persists the group's summary snapshot. Runs inside the
   * worker; the operation itself is idempotent (upsert on the unique groupId),
   * so duplicate deliveries are harmless.
   */
  async recomputeGroupSummary(groupId: string): Promise<GroupSummaryDto> {
    const group = await this.repository.findGroupById(groupId);
    if (!group) {
      throw new NotFoundError(APP_ERRORS.GROUP_NOT_FOUND, "Group not found.");
    }

    const metrics = await this.repository.aggregateGroup(groupId);
    const summary = await this.repository.upsertSummary(groupId, metrics, new Date());

    return this.toDto(summary);
  }

  /**
   * Returns the latest computed summary for the authenticated requester, who
   * must be a member of the group.
   */
  async getGroupSummary(requesterId: string, groupId: string): Promise<GroupSummaryDto> {
    const group = await this.repository.findGroupById(groupId);
    if (!group) {
      throw new NotFoundError(APP_ERRORS.GROUP_NOT_FOUND, "Group not found.");
    }

    const isMember = await this.repository.isGroupMember(groupId, requesterId);
    if (!isMember) {
      throw new ForbiddenError(APP_ERRORS.NOT_GROUP_MEMBER, "You are not a member of this group.");
    }

    const summary = await this.repository.findSummaryByGroupId(groupId);
    if (!summary) {
      throw new NotFoundError(
        APP_ERRORS.GROUP_SUMMARY_NOT_FOUND,
        "No summary has been computed for this group yet. Queue a recompute to generate one.",
      );
    }

    return this.toDto(summary);
  }

  /**
   * Authorizes a group member and enqueues a recompute job. The HTTP response
   * does not wait for the recompute — the job is processed by the background
   * worker. When Redis is unavailable the request fails cleanly with a generic
   * error instead of silently accepting a job that will never run.
   */
  async enqueueGroupSummaryRecompute(
    requesterId: string,
    groupId: string,
    requestId?: string,
  ): Promise<QueuedJobDto> {
    const group = await this.repository.findGroupById(groupId);
    if (!group) {
      throw new NotFoundError(APP_ERRORS.GROUP_NOT_FOUND, "Group not found.");
    }

    const isMember = await this.repository.isGroupMember(groupId, requesterId);
    if (!isMember) {
      throw new ForbiddenError(APP_ERRORS.NOT_GROUP_MEMBER, "You are not a member of this group.");
    }

    try {
      return await enqueueGroupSummaryRecomputeJob(groupId, { requestId });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      metrics.increment(METRIC.queueFailuresTotal);
      logger.error("Failed to enqueue a group summary recompute job", {
        jobType: JOB_TYPES.GROUP_SUMMARY_RECOMPUTE,
        error: message,
      });
      throw new AppError(
        HTTP_STATUSES.INTERNAL_SERVER_ERROR,
        APP_ERRORS.JOB_ENQUEUE_FAILED,
        "Could not queue the requested operation. Please try again shortly.",
      );
    }
  }

  private toDto(summary: GroupSummaryRecord): GroupSummaryDto {
    return {
      id: summary.id,
      groupId: summary.groupId,
      totalSpentMinorUnits: Number(summary.totalSpentMinorUnits),
      expenseCount: summary.expenseCount,
      settlementCount: summary.settlementCount,
      memberCount: summary.memberCount,
      currencyCode: summary.currencyCode,
      computedAt: summary.computedAt,
    };
  }
}
