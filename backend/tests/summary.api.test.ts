import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

import { createApp } from "../src/app.js";
import { HTTP_STATUSES } from "../src/constants/http-statuses.js";
import { JOB_TYPES } from "../src/queues/job.types.js";

const JWT_SECRET = "test-secret-that-is-long-enough-for-tests";

function signToken(userId: string): string {
  return jwt.sign({ sub: userId, email: "me@example.com" }, JWT_SECRET, { expiresIn: "1h" });
}

vi.mock("../src/db/prisma.js", async () => {
  return {
    prisma: {
      group: { findUnique: vi.fn() },
      groupMember: { findUnique: vi.fn(), count: vi.fn() },
      expense: { aggregate: vi.fn(), count: vi.fn() },
      settlement: { count: vi.fn() },
      groupSummary: { upsert: vi.fn(), findUnique: vi.fn() },
    },
  };
});

vi.mock("../src/queues/jobQueue.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/queues/jobQueue.js")>();
  return {
    ...original,
    getJobQueue: vi.fn(),
  };
});

import { prisma } from "../src/db/prisma.js";
import { getJobQueue } from "../src/queues/jobQueue.js";

const mockPrisma = vi.mocked(prisma);
const mockGetJobQueue = vi.mocked(getJobQueue);

function fakeQueue(enqueue: ReturnType<typeof vi.fn>) {
  return { enqueue };
}

const ownerId = "owner-1";
const aliceId = "alice-1";
const outsiderId = "outsider-1";

const group = { id: "group-1", name: "Trip to Naran", createdById: ownerId };

function memberRow() {
  return { id: "membership-1" };
}

function storedSummary(overrides: Record<string, unknown> = {}) {
  return {
    id: "summary-1",
    groupId: "group-1",
    totalSpentMinorUnits: 1000n,
    expenseCount: 3,
    settlementCount: 2,
    memberCount: 4,
    currencyCode: "PKR",
    computedAt: new Date("2026-09-09T12:00:00Z"),
    createdAt: new Date("2026-09-09T12:00:00Z"),
    updatedAt: new Date("2026-09-09T12:00:00Z"),
    ...overrides,
  };
}

describe("Group summary API", () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.group.findUnique.mockReset();
    mockPrisma.groupMember.findUnique.mockReset();
    mockPrisma.groupSummary.findUnique.mockReset();
    mockPrisma.groupSummary.upsert.mockReset();
    mockGetJobQueue.mockReset();
    mockGetJobQueue.mockReturnValue(
      fakeQueue(
        vi.fn().mockResolvedValue({
          jobId: "job-1",
          type: JOB_TYPES.GROUP_SUMMARY_RECOMPUTE,
          payload: { groupId: "group-1" },
          attempts: 0,
          createdAt: new Date().toISOString(),
        }),
      ) as never,
    );
    app = createApp();
  });

  describe("POST /api/v1/groups/:id/summary/recompute", () => {
    it("enqueues a recompute job and returns 202 for a member", async () => {
      mockPrisma.group.findUnique.mockResolvedValue(group);
      mockPrisma.groupMember.findUnique.mockResolvedValue(memberRow());

      const res = await request(app)
        .post("/api/v1/groups/group-1/summary/recompute")
        .set("Authorization", `Bearer ${signToken(aliceId)}`);

      expect(res.status).toBe(HTTP_STATUSES.ACCEPTED);
      expect(res.body.success).toBe(true);
      expect(res.body.data.job).toEqual({
        jobId: "job-1",
        type: JOB_TYPES.GROUP_SUMMARY_RECOMPUTE,
        status: "queued",
      });
      const enqueue = mockGetJobQueue().enqueue as ReturnType<typeof vi.fn>;
      expect(enqueue).toHaveBeenCalledWith(
        JOB_TYPES.GROUP_SUMMARY_RECOMPUTE,
        { groupId: "group-1" },
        { requestId: expect.any(String) },
      );
      expect(JSON.stringify(res.body)).not.toContain("groupId");
    });

    it("returns 401 without authentication", async () => {
      const res = await request(app).post("/api/v1/groups/group-1/summary/recompute");
      expect(res.status).toBe(HTTP_STATUSES.UNAUTHORIZED);
      expect(mockGetJobQueue).not.toHaveBeenCalled();
    });

    it("returns 403 for a non-member", async () => {
      mockPrisma.group.findUnique.mockResolvedValue(group);
      mockPrisma.groupMember.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .post("/api/v1/groups/group-1/summary/recompute")
        .set("Authorization", `Bearer ${signToken(outsiderId)}`);

      expect(res.status).toBe(HTTP_STATUSES.FORBIDDEN);
      expect(mockGetJobQueue).not.toHaveBeenCalled();
    });

    it("returns 404 when the group does not exist", async () => {
      mockPrisma.group.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .post("/api/v1/groups/missing/summary/recompute")
        .set("Authorization", `Bearer ${signToken(aliceId)}`);

      expect(res.status).toBe(HTTP_STATUSES.NOT_FOUND);
      expect(mockGetJobQueue).not.toHaveBeenCalled();
    });

    it("returns 500 without a false acceptance when the queue write fails", async () => {
      mockPrisma.group.findUnique.mockResolvedValue(group);
      mockPrisma.groupMember.findUnique.mockResolvedValue(memberRow());
      mockGetJobQueue.mockReturnValue(
        fakeQueue(vi.fn().mockRejectedValue(new Error("Connection is closed."))) as never,
      );

      const res = await request(app)
        .post("/api/v1/groups/group-1/summary/recompute")
        .set("Authorization", `Bearer ${signToken(aliceId)}`);

      expect(res.status).toBe(HTTP_STATUSES.INTERNAL_SERVER_ERROR);
      expect(res.body.success).toBe(false);
    });
  });

  describe("GET /api/v1/groups/:id/summary", () => {
    it("returns the computed summary for a member", async () => {
      mockPrisma.group.findUnique.mockResolvedValue(group);
      mockPrisma.groupMember.findUnique.mockResolvedValue(memberRow());
      mockPrisma.groupSummary.findUnique.mockResolvedValue(storedSummary());

      const res = await request(app)
        .get("/api/v1/groups/group-1/summary")
        .set("Authorization", `Bearer ${signToken(aliceId)}`);

      expect(res.status).toBe(HTTP_STATUSES.OK);
      expect(res.body.success).toBe(true);
      expect(res.body.data.summary).toMatchObject({
        id: "summary-1",
        groupId: "group-1",
        totalSpentMinorUnits: 1000,
        expenseCount: 3,
        settlementCount: 2,
        memberCount: 4,
        currencyCode: "PKR",
      });
    });

    it("returns 401 without authentication", async () => {
      const res = await request(app).get("/api/v1/groups/group-1/summary");
      expect(res.status).toBe(HTTP_STATUSES.UNAUTHORIZED);
    });

    it("returns 403 for a non-member", async () => {
      mockPrisma.group.findUnique.mockResolvedValue(group);
      mockPrisma.groupMember.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .get("/api/v1/groups/group-1/summary")
        .set("Authorization", `Bearer ${signToken(outsiderId)}`);

      expect(res.status).toBe(HTTP_STATUSES.FORBIDDEN);
    });

    it("returns 404 when the group does not exist", async () => {
      mockPrisma.group.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .get("/api/v1/groups/missing/summary")
        .set("Authorization", `Bearer ${signToken(aliceId)}`);

      expect(res.status).toBe(HTTP_STATUSES.NOT_FOUND);
    });

    it("returns 404 before any summary has been computed", async () => {
      mockPrisma.group.findUnique.mockResolvedValue(group);
      mockPrisma.groupMember.findUnique.mockResolvedValue(memberRow());
      mockPrisma.groupSummary.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .get("/api/v1/groups/group-1/summary")
        .set("Authorization", `Bearer ${signToken(aliceId)}`);

      expect(res.status).toBe(HTTP_STATUSES.NOT_FOUND);
      expect(res.body.success).toBe(false);
    });
  });
});
