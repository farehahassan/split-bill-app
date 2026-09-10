import { logger } from "../utils/logger.js";
import { METRIC, METRIC_LABEL, metrics } from "../metrics/registry.js";
import { jobRegistry, type JobRegistry } from "./jobRegistry.js";
import { PermanentJobFailureError, type JobQueue } from "./jobQueue.js";
import type { JobEnvelope, JobType } from "./job.types.js";

export interface WorkerRunnerOptions {
  queue: JobQueue;
  /** Job registry for dispatch. Defaults to the process-wide registry. */
  registry?: JobRegistry;
  /** Idle poll interval in milliseconds. */
  pollIntervalMs?: number;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const formatError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Polls the queue for every registered job type and runs claimed jobs. Keeps a
 * count of in-flight jobs so `stop()` can shut down gracefully without
 * abandoning work that is currently running.
 */
export class WorkerRunner {
  private readonly queue: JobQueue;
  private readonly registry: JobRegistry;
  private readonly pollIntervalMs: number;
  private running = false;
  private inFlight = 0;

  constructor(options: WorkerRunnerOptions) {
    this.queue = options.queue;
    this.registry = options.registry ?? jobRegistry;
    this.pollIntervalMs = options.pollIntervalMs ?? 100;
  }

  /**
   * Runs the poll loop until `stop()` is called. Only one loop can run at a
   * time; subsequent calls while running are no-ops.
   */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.running) {
        await this.tick();
        await sleep(this.pollIntervalMs);
      }
    } finally {
      this.running = false;
    }
  }

  /**
   * Stops the poll loop and waits for any job currently being processed to
   * finish. Safe to call from a signal handler.
   */
  async stop(): Promise<void> {
    this.running = false;
    while (this.inFlight > 0) {
      await sleep(25);
    }
  }

  /**
   * Polls each registered job type exactly once and processes at most one job
   * per type. Errors are logged and contained so a failing type cannot take
   * down the whole loop. Testable without timers by awaiting `tick()` directly.
   */
  async tick(): Promise<void> {
    const types = Object.keys(this.registry) as JobType[];
    for (const type of types) {
      try {
        await this.processType(type);
      } catch (error) {
        logger.error("Job worker iteration failed", {
          jobType: type,
          error: formatError(error),
        });
      }
    }
  }

  private async processType(type: JobType): Promise<void> {
    const result = await this.queue.claimNext(type);

    if (result.kind === "empty") return;
    if (result.kind === "busy") return;
    if (result.kind === "malformed") {
      logger.warn("Discarded an unreadable job", { jobType: type, jobId: result.jobId });
      return;
    }

    const { jobId, envelope } = result;
    const registration = this.registry[type];
    const attemptNumber = envelope.attempts + 1;
    const requestId = envelope.requestId ?? null;
    const startedAt = Date.now();

    // Job type labels are always drawn from the controlled JobType allowlist
    // (never from a payload field), so this label dimension is bounded.
    const jobLabels = { [METRIC_LABEL.jobType]: type };

    this.inFlight += 1;
    try {
      const parsed = registration.schema.safeParse(envelope.payload);
      if (!parsed.success) {
        await this.queue.discard(type, jobId);
        metrics.increment(METRIC.backgroundJobsDiscardedTotal, jobLabels);
        logger.warn("Discarded a job with an invalid payload", {
          jobType: type,
          jobId,
          attempt: attemptNumber,
          requestId,
          reason: parsed.error.issues,
        });
        return;
      }

      const job: JobEnvelope = { ...envelope, payload: parsed.data };
      await registration.process(job);
      await this.queue.complete(type, jobId);

      metrics.increment(METRIC.backgroundJobsSucceededTotal, jobLabels);

      logger.info("Background job processed", {
        jobType: type,
        jobId,
        attempt: attemptNumber,
        requestId,
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      if (error instanceof PermanentJobFailureError) {
        await this.queue.discard(type, jobId);
        metrics.increment(METRIC.backgroundJobsFailedTotal, jobLabels);
        metrics.increment(METRIC.backgroundJobsDiscardedTotal, jobLabels);
        logger.error("Background job permanently failed", {
          jobType: type,
          jobId,
          attempt: attemptNumber,
          requestId,
          error: formatError(error),
        });
        return;
      }

      const attemptsAfterThisFailure = envelope.attempts + 1;
      if (attemptsAfterThisFailure >= this.queue.config.maxAttempts) {
        await this.queue.discard(type, jobId);
        metrics.increment(METRIC.backgroundJobsFailedTotal, jobLabels);
        metrics.increment(METRIC.backgroundJobsDiscardedTotal, jobLabels);
        logger.error("Background job failed after exhausting all attempts", {
          jobType: type,
          jobId,
          attempt: attemptsAfterThisFailure,
          requestId,
          error: formatError(error),
        });
        return;
      }

      const delayMs = this.queue.backoffFor(attemptsAfterThisFailure);
      await this.queue.retryAfterFailure(type, jobId, attemptsAfterThisFailure, delayMs);
      metrics.increment(METRIC.backgroundJobsFailedTotal, jobLabels);
      metrics.increment(METRIC.backgroundJobsRetriedTotal, jobLabels);
      logger.warn("Background job failed; scheduling a retry", {
        jobType: type,
        jobId,
        attempt: attemptsAfterThisFailure,
        retryInMs: delayMs,
        requestId,
        error: formatError(error),
      });
    } finally {
      this.inFlight -= 1;
    }
  }
}
