import { describe, it, expect, beforeEach, vi } from "vitest";
import { z } from "zod";

import { JobQueue, PermanentJobFailureError } from "../src/queues/jobQueue.js";
import type { JobRegistry } from "../src/queues/jobRegistry.js";
import { JOB_TYPES } from "../src/queues/job.types.js";
import { WorkerRunner } from "../src/queues/workerRunner.js";
import { METRIC, METRIC_LABEL, resetMetrics, metrics } from "../src/metrics/registry.js";
import { FakeRedis } from "./helpers/fakeRedis.js";

beforeEach(() => {
  resetMetrics();
  vi.clearAllMocks();
});

const TYPE = JOB_TYPES.GROUP_SUMMARY_RECOMPUTE;
const payloadSchema = z.object({ groupId: z.string().min(1) }).strict();

function makeQueue(redis: FakeRedis): JobQueue {
  return new JobQueue(redis, {
    maxAttempts: 3,
    baseBackoffMs: 100,
    maxBackoffMs: 500,
    leaseMs: 1000,
    payloadTtlMs: 86400000,
  });
}

function makeRegistry(
  process: (job: { type: string; payload: unknown }) => Promise<void>,
): JobRegistry {
  return {
    [TYPE]: { type: TYPE, schema: payloadSchema, process },
  };
}

function makeDue(redis: FakeRedis): void {
  const member = redis.zsets.get(`job:queue:${TYPE}`)?.[0];
  if (member) member.score = Date.now() - 1000;
}

const jobLabels = { [METRIC_LABEL.jobType]: TYPE };

function succeeded(): number {
  return metrics.counterValue(METRIC.backgroundJobsSucceededTotal, jobLabels);
}

function failed(): number {
  return metrics.counterValue(METRIC.backgroundJobsFailedTotal, jobLabels);
}

function retried(): number {
  return metrics.counterValue(METRIC.backgroundJobsRetriedTotal, jobLabels);
}

function discarded(): number {
  return metrics.counterValue(METRIC.backgroundJobsDiscardedTotal, jobLabels);
}

async function enqueueAndTick(redis: FakeRedis, runner: WorkerRunner): Promise<void> {
  await redis.zadd(`job:queue:${TYPE}`, Date.now() - 1000, "job-1");
  redis.store.set(`job:data:job-1`, {
    value: JSON.stringify({
      jobId: "job-1",
      type: TYPE,
      payload: { groupId: "group-1" },
      attempts: 0,
      createdAt: new Date().toISOString(),
    }),
    expiresAt: Date.now() + 60_000,
  });
  await runner.tick();
}

describe("WorkerRunner job metrics", () => {
  it("increments succeeded for a job processed and completed", async () => {
    const redis = new FakeRedis();
    const runner = new WorkerRunner({
      queue: makeQueue(redis),
      registry: makeRegistry(vi.fn(async () => {})),
    });

    await enqueueAndTick(redis, runner);

    expect(succeeded()).toBe(1);
    expect(failed()).toBe(0);
    expect(retried()).toBe(0);
    expect(discarded()).toBe(0);
  });

  it("increments failed and retried for a retryable failure", async () => {
    const redis = new FakeRedis();
    const runner = new WorkerRunner({
      queue: makeQueue(redis),
      registry: makeRegistry(
        vi.fn(async () => {
          throw new Error("db timeout");
        }),
      ),
    });

    await enqueueAndTick(redis, runner);

    expect(succeeded()).toBe(0);
    expect(failed()).toBe(1);
    expect(retried()).toBe(1);
    expect(discarded()).toBe(0);
  });

  it("increments failed and discarded for a permanent failure", async () => {
    const redis = new FakeRedis();
    const runner = new WorkerRunner({
      queue: makeQueue(redis),
      registry: makeRegistry(
        vi.fn(async () => {
          throw new PermanentJobFailureError("group is gone");
        }),
      ),
    });

    await enqueueAndTick(redis, runner);

    expect(failed()).toBe(1);
    expect(discarded()).toBe(1);
    expect(retried()).toBe(0);
  });

  it("increments discarded once attempts are exhausted", async () => {
    const redis = new FakeRedis();
    const runner = new WorkerRunner({
      queue: makeQueue(redis),
      registry: makeRegistry(
        vi.fn(async () => {
          throw new Error("always fails");
        }),
      ),
    });

    await enqueueAndTick(redis, runner);
    makeDue(redis);
    await runner.tick();
    makeDue(redis);
    await runner.tick();

    expect(failed()).toBe(3);
    expect(retried()).toBe(2);
    expect(discarded()).toBe(1);
  });

  it("increments discarded for a malformed payload without calling the handler", async () => {
    const redis = new FakeRedis();
    const process = vi.fn(async () => {});
    const runner = new WorkerRunner({
      queue: makeQueue(redis),
      registry: makeRegistry(process),
    });

    await redis.zadd(`job:queue:${TYPE}`, Date.now() - 1000, "job-1");
    redis.store.set(`job:data:job-1`, {
      value: JSON.stringify({
        jobId: "job-1",
        type: TYPE,
        payload: { groupId: "group-1", extra: "not allowed" },
        attempts: 0,
        createdAt: new Date().toISOString(),
      }),
      expiresAt: Date.now() + 60_000,
    });
    await runner.tick();

    expect(process).not.toHaveBeenCalled();
    expect(discarded()).toBe(1);
  });

  it("never uses a job payload field as a label", async () => {
    const redis = new FakeRedis();
    const runner = new WorkerRunner({
      queue: makeQueue(redis),
      registry: makeRegistry(vi.fn(async () => {})),
    });

    await enqueueAndTick(redis, runner);

    const rendered = metrics.renderPrometheus();
    const jobs = rendered
      .split("\n")
      .filter((line) => line.startsWith("background_jobs_succeeded_total"));
    expect(jobs.length).toBe(1);
    expect(jobs[0]).toContain(`job_type="${TYPE}"`);
    expect(jobs[0]).not.toContain("group-1");
  });
});
