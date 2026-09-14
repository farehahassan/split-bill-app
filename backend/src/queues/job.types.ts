/**
 * Allowlist of every background job type the worker understands. A job type is
 * a stable string that is never built from untrusted input: enqueuing rejects
 * unknown types and the worker dispatches through a registry keyed by this
 * union, so a payload can never select an arbitrary code path.
 */
export const JOB_TYPES = {
  GROUP_SUMMARY_RECOMPUTE: "GROUP_SUMMARY_RECOMPUTE",
} as const;

export type JobType = (typeof JOB_TYPES)[keyof typeof JOB_TYPES];

/**
 * The serialized shape of a queued job. Only stable identity, non-sensitive
 * payload data, and retry bookkeeping live here — never passwords, tokens,
 * authorization headers, or database credentials.
 *
 * `attempts` counts the attempts already performed (0 = freshly enqueued).
 * `requestId` is the optional correlation/tracing ID of the HTTP request that
 * enqueued the job, reused as-is by the worker so logs can be correlated.
 */
export interface JobEnvelope<TPayload = unknown> {
  jobId: string;
  type: JobType;
  payload: TPayload;
  attempts: number;
  createdAt: string;
  requestId?: string;
}

export interface EnqueueJobOptions {
  /**
   * Optional correlation/tracing ID propagated from the enqueuing request.
   * Stored verbatim (it is already sanitized by the request-ID middleware) and
   * reused by the worker in its logs.
   */
  requestId?: string;
  /**
   * Optional epoch-millis timestamp at which the job may first be processed.
   * Defaults to "now". Used by the retry path to schedule backoff.
   */
  scheduledFor?: number;
}
