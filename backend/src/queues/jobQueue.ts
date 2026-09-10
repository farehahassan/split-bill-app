import { randomUUID } from "node:crypto";

import { loadEnv, type Env } from "../config/env.js";
import { getRedis, type RedisLike } from "../redis/redisClient.js";
import { logger } from "../utils/logger.js";
import { JOB_TYPES, type EnqueueJobOptions, type JobEnvelope, type JobType } from "./job.types.js";

/**
 * Atomically claims the earliest due job (lowest `nextAttemptAt` score <= now)
 * WITHOUT removing it. The member stays in the set; the TTL-bounded in-flight
 * lease guards against duplicate consumption. Keeping the member in place means
 * a worker that crashes mid-job leaves the job recoverable: once the lease
 * expires, the next poll retries it (at-least-once delivery).
 */
const CLAIM_SCRIPT = `
local ids = redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', ARGV[1], 'LIMIT', 0, 1)
return ids[1]
`;

/**
 * Tuning knobs for the queue. All values come from the centralized env config
 * (see {@link buildQueueConfig}).
 */
export interface JobQueueConfig {
  /** Maximum number of times a job is attempted before it is discarded. */
  maxAttempts: number;
  /** Exponential backoff base for the first retry, in milliseconds. */
  baseBackoffMs: number;
  /** Hard cap on any single retry delay, in milliseconds. */
  maxBackoffMs: number;
  /** In-flight lease length, in milliseconds. Must exceed the longest job. */
  leaseMs: number;
  /** TTL for the serialized job payload. Must exceed the full retry horizon. */
  payloadTtlMs: number;
}

export function buildQueueConfig(env: Env): JobQueueConfig {
  return {
    maxAttempts: env.JOB_QUEUE_MAX_ATTEMPTS,
    baseBackoffMs: env.JOB_QUEUE_BASE_BACKOFF_MS,
    maxBackoffMs: env.JOB_QUEUE_MAX_BACKOFF_MS,
    leaseMs: env.JOB_QUEUE_LEASE_MS,
    payloadTtlMs: env.JOB_QUEUE_PAYLOAD_TTL_MS,
  };
}

/**
 * Thrown by a job handler to declare that the work can never succeed and must
 * not be retried (e.g. the target resource no longer exists). The worker maps
 * this into a terminal discard.
 */
export class PermanentJobFailureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentJobFailureError";
  }
}

export type ClaimResult =
  | { kind: "empty" }
  | { kind: "busy" }
  | { kind: "malformed"; jobId: string }
  | { kind: "claimed"; jobId: string; envelope: JobEnvelope };

/**
 * Redis-backed FIFO-ish job queue built on two primitives:
 *
 * - A sorted set `job:queue:{type}` whose member score is the next-attempt
 *   timestamp. Enqueuing inserts with `now`; a retry re-inserts with
 *   `now + backoff`, which naturally honors delays without timers.
 * - A payload key `job:data:{jobId}` holding the serialized envelope with a TTL,
 *   plus an in-flight marker `job:inflight:{jobId}` (SET NX PX) that leases the
 *   job to one consumer at a time.
 *
 * Delivery is **at-least-once**: on success the job is removed from the set; on
 * in-process failure it is re-scheduled with backoff; on a worker crash the
 * member stays queued and is reclaimed after the lease expires. Handlers must
 * therefore be idempotent, which the summary recompute workload is (upsert by
 * `groupId`).
 *
 * Redis is a coordination/transport layer only — every authoritative record
 * stays in PostgreSQL. No sensitive data is ever placed in payloads.
 */
export class JobQueue {
  constructor(
    private readonly redis: RedisLike,
    readonly config: JobQueueConfig,
  ) {}

  private queueKey(type: JobType): string {
    return `job:queue:${type}`;
  }

  private dataKey(jobId: string): string {
    return `job:data:${jobId}`;
  }

  private inflightKey(jobId: string): string {
    return `job:inflight:${jobId}`;
  }

  /**
   * Computes the exponential retry delay (capped) for a given attempt count.
   * Attempt 1 (the first failure) waits `baseBackoffMs`, attempt 2 waits
   * `baseBackoffMs * 2`, and so on, never exceeding `maxBackoffMs`.
   */
  backoffFor(attempts: number): number {
    const delay = this.config.baseBackoffMs * 2 ** (attempts - 1);
    return Math.min(this.config.maxBackoffMs, delay);
  }

  /**
   * Queues a job of an allowlisted type. Job types are validated at runtime as
   * defense-in-depth on top of the `JobType` union. The payload is kept minimal
   * and non-sensitive (IDs only).
   */
  async enqueue<TPayload extends object>(
    type: JobType,
    payload: TPayload,
    options: EnqueueJobOptions = {},
  ): Promise<JobEnvelope<TPayload>> {
    if (!Object.values(JOB_TYPES).includes(type)) {
      throw new Error(`Unknown job type "${type}".`);
    }

    const jobId = randomUUID();
    const envelope: JobEnvelope<TPayload> = {
      jobId,
      type,
      payload,
      attempts: 0,
      createdAt: new Date().toISOString(),
      ...(options.requestId ? { requestId: options.requestId } : {}),
    };

    const serialized = JSON.stringify(envelope);
    await this.redis.set(this.dataKey(jobId), serialized, "PX", this.config.payloadTtlMs);
    await this.redis.zadd(this.queueKey(type), options.scheduledFor ?? Date.now(), jobId);

    return envelope;
  }

  /**
   * Polls the queue for the earliest due job of `type`. Returns the job only
   * after acquiring its in-flight lease. `busy` means another consumer already
   * holds the lease; `malformed` means the payload is unreadable, in which case
   * the stale artifacts are cleaned up and the caller should not proceed.
   */
  async claimNext(type: JobType): Promise<ClaimResult> {
    const jobId = await this.dueJobId(type);
    if (jobId === null) return { kind: "empty" };

    const leaseToken = randomUUID();
    const lease = await this.redis.set(
      this.inflightKey(jobId),
      leaseToken,
      "PX",
      this.config.leaseMs,
      "NX",
    );
    if (lease !== "OK") return { kind: "busy" };

    const raw = await this.redis.get(this.dataKey(jobId));
    if (raw === null) {
      await this.discard(type, jobId);
      return { kind: "malformed", jobId };
    }

    const envelope = this.parseEnvelope(raw, type, jobId);
    if (envelope === null) {
      await this.discard(type, jobId);
      return { kind: "malformed", jobId };
    }

    return { kind: "claimed", jobId, envelope };
  }

  /**
   * Acknowledges a successfully processed job: removes it from the queue (and
   * its payload + lease) so it is never delivered again.
   */
  async complete(type: JobType, jobId: string): Promise<void> {
    await this.redis.zrem(this.queueKey(type), jobId);
    await this.redis.del(this.dataKey(jobId), this.inflightKey(jobId));
  }

  /**
   * Re-schedules a failed job for a later attempt with exponential backoff. The
   * payload is rewritten with the new attempt count and a fresh TTL. If the
   * payload already expired, the stale queue membership is dropped instead.
   */
  async retryAfterFailure(
    type: JobType,
    jobId: string,
    attempts: number,
    delayMs: number,
  ): Promise<void> {
    const raw = await this.redis.get(this.dataKey(jobId));
    if (raw === null) {
      await this.redis.zrem(this.queueKey(type), jobId);
      await this.redis.del(this.inflightKey(jobId));
      return;
    }

    const envelope = this.parseEnvelope(raw, type, jobId);
    if (envelope === null) {
      await this.redis.zrem(this.queueKey(type), jobId);
      await this.redis.del(this.inflightKey(jobId));
      return;
    }

    const updated = { ...envelope, attempts };
    await this.redis.set(
      this.dataKey(jobId),
      JSON.stringify(updated),
      "PX",
      this.config.payloadTtlMs,
    );
    await this.redis.zadd(this.queueKey(type), Date.now() + delayMs, jobId);
    await this.redis.del(this.inflightKey(jobId));
  }

  /**
   * Terminally removes a job (permanent failure, malformed payload, or retries
   * exhausted) from the queue, deleting its payload and lease.
   */
  async discard(type: JobType, jobId: string): Promise<void> {
    await this.redis.zrem(this.queueKey(type), jobId);
    await this.redis.del(this.dataKey(jobId), this.inflightKey(jobId));
  }

  private async dueJobId(type: JobType): Promise<string | null> {
    const result = await this.redis.eval(CLAIM_SCRIPT, 1, this.queueKey(type), String(Date.now()));
    return typeof result === "string" ? result : null;
  }

  private parseEnvelope(raw: string, expectedType: JobType, jobId: string): JobEnvelope | null {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }

    if (typeof parsed !== "object" || parsed === null) return null;
    const candidate = parsed as Record<string, unknown>;
    if (candidate.jobId !== jobId) return null;
    if (candidate.type !== expectedType) return null;
    if (typeof candidate.createdAt !== "string") return null;
    if (typeof candidate.payload !== "object" || candidate.payload === null) return null;
    if (!Number.isInteger(candidate.attempts) || (candidate.attempts as number) < 0) return null;

    return parsed as JobEnvelope;
  }
}

let _jobQueue: JobQueue | null = null;

/**
 * Returns the process-wide job queue backed by the shared Redis singleton.
 * Lazily created so importing this module has no side effects.
 */
export function getJobQueue(): JobQueue {
  if (!_jobQueue) {
    _jobQueue = new JobQueue(getRedis(), buildQueueConfig(loadEnv()));
    logger.info("Background job queue initialized");
  }
  return _jobQueue;
}
