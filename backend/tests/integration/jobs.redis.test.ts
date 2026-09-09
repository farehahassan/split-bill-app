import { describe, expect, it } from "vitest";

import { prisma } from "../../src/db/prisma.js";
import { JOB_TYPES } from "../../src/queues/job.types.js";
import { getJobQueue } from "../../src/queues/jobQueue.js";
import { WorkerRunner } from "../../src/queues/workerRunner.js";
import { enqueueGroupSummaryRecomputeJob } from "../../src/modules/summary/summary.service.js";
import { SummaryRepository } from "../../src/modules/summary/summary.repository.js";
import { SummaryService } from "../../src/modules/summary/summary.service.js";
import { ExpenseRepository } from "../../src/modules/expenses/expense.repository.js";
import { ExpenseService } from "../../src/modules/expenses/expense.service.js";
import { testRedisClient } from "./helpers/redis.js";
import { addTestMember, createTestGroup, createTestUser } from "./helpers/fixtures.js";

const queue = getJobQueue();
const runner = new WorkerRunner({ queue, pollIntervalMs: 50 });

const summaryService = new SummaryService(new SummaryRepository());
const expenseService = new ExpenseService(new ExpenseRepository());

describe("background jobs (Redis + PostgreSQL)", () => {
  it("processes a recompute job and persists aggregates derived from authoritative tables", async () => {
    const owner = await createTestUser();
    const memberA = await createTestUser();
    const memberB = await createTestUser();
    const group = await createTestGroup(owner.id, { name: "Job Group" });
    await addTestMember(group.id, memberA.id);
    await addTestMember(group.id, memberB.id);

    await expenseService.createExpense(owner.id, {
      groupId: group.id,
      description: "BBQ",
      amountMinorUnits: 6000,
      payerId: owner.id,
      splitType: "EQUAL",
      participants: [{ userId: owner.id }, { userId: memberA.id }, { userId: memberB.id }],
    });
    await prisma.settlement.create({
      data: {
        groupId: group.id,
        payerId: memberA.id,
        payeeId: owner.id,
        amountMinorUnits: 1500n,
        currencyCode: "PKR",
        settledAt: new Date(),
      },
    });

    await enqueueGroupSummaryRecomputeJob(group.id, { requestId: "integration-request" });
    await runner.tick();

    const summary = await prisma.groupSummary.findUnique({ where: { groupId: group.id } });
    expect(summary).not.toBeNull();
    expect(summary!.totalSpentMinorUnits).toBe(6000n);
    expect(summary!.expenseCount).toBe(1);
    expect(summary!.settlementCount).toBe(1);
    expect(summary!.memberCount).toBe(3);
    expect(summary!.currencyCode).toBe("PKR");

    // Delivery is at-least-once; a second run must not create a duplicate row.
    await runner.tick();
    expect((await prisma.groupSummary.count({ where: { groupId: group.id } }))).toBe(1);

    // The job was completed and its payload cleaned up.
    expect((await queue.claimNext(JOB_TYPES.GROUP_SUMMARY_RECOMPUTE)).kind).toBe("empty");
    expect(
      await testRedisClient().keys(`job:data:*`).then((keys) => keys),
    ).toEqual([]);

    // The service exposes the snapshot to members.
    const dto = await summaryService.getGroupSummary(owner.id, group.id);
    expect(dto.totalSpentMinorUnits).toBe(6000);
    expect(dto.memberCount).toBe(3);
  });

  it("discards a job whose group was deleted (permanent failure) without retries", async () => {
    const ghostGroupId = "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d";
    const envelope = await queue.enqueue(JOB_TYPES.GROUP_SUMMARY_RECOMPUTE, {
      groupId: ghostGroupId,
    });

    await runner.tick();

    expect((await queue.claimNext(JOB_TYPES.GROUP_SUMMARY_RECOMPUTE)).kind).toBe("empty");
    expect(await testRedisClient().get(`job:data:${envelope.jobId}`)).toBeNull();
    expect(await prisma.groupSummary.findUnique({ where: { groupId: ghostGroupId } })).toBeNull();
  });

  it("discards a job with an invalid payload before any work happens", async () => {
    const envelope = await queue.enqueue(
      JOB_TYPES.GROUP_SUMMARY_RECOMPUTE,
      // Missing the required groupId field.
      { unexpected: true },
    );

    await runner.tick();

    expect((await queue.claimNext(JOB_TYPES.GROUP_SUMMARY_RECOMPUTE)).kind).toBe("empty");
    expect(await testRedisClient().get(`job:data:${envelope.jobId}`)).toBeNull();
  });

  it("re-schedules transient failures with backoff, keeping them due in the future", async () => {
    const type = JOB_TYPES.GROUP_SUMMARY_RECOMPUTE;
    const envelope = await queue.enqueue(type, { groupId: "retry-me" });

    const claimed = await queue.claimNext(type);
    expect(claimed.kind).toBe("claimed");

    // A transient worker failure re-schedules with exponential backoff.
    await queue.retryAfterFailure(type, envelope.jobId, 1, queue.backoffFor(1));

    const due = Number(await testRedisClient().zscore(`job:queue:${type}`, envelope.jobId));
    expect(due).toBeGreaterThan(Date.now());

    // It stays not-claimable until the backoff elapses.
    expect((await queue.claimNext(type)).kind).toBe("empty");

    // Clean up the scheduled job so later suites start from an empty queue.
    await queue.discard(type, envelope.jobId);
  });
});