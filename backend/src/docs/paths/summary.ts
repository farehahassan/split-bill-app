import type { PathItemObject, Schema } from "../openapi.types.js";
import { groupIdPathParameter } from "../components/parameters.js";
import { jsonResponse, componentResponse, successEnvelope } from "../helpers.js";

export const SUMMARY_TAG = "Group Summary";

const ref = (name: string): Schema => ({ $ref: `#/components/schemas/${name}` });

const summaryData = () =>
  successEnvelope({
    type: "object",
    properties: { summary: ref("GroupSummary") },
    required: ["summary"],
  });

const summaryExample = {
  id: "9f8e7d6c-5b4a-3928-1706-0e02b2c3d479",
  groupId: "550e8400-e29b-41d4-a716-446655440000",
  totalSpentMinorUnits: 50000,
  expenseCount: 12,
  settlementCount: 3,
  memberCount: 5,
  currencyCode: "PKR",
  computedAt: "2026-01-18T08:00:00.000Z",
};

const summaryPaths: Record<string, PathItemObject> = {
  "/api/v1/groups/{id}/summary": {
    get: {
      tags: [SUMMARY_TAG],
      summary: "Get the group summary",
      description:
        "Returns the latest computed summary snapshot (total spent, expense/settlement/member counts). " +
        "The summary is a derived, non-authoritative snapshot computed in the background; until the first recompute completes, " +
        "this endpoint returns HTTP 404. The authenticated user must be a group member. Protected endpoint.",
      operationId: "getGroupSummary",
      parameters: [groupIdPathParameter],
      responses: {
        200: jsonResponse("The latest summary snapshot.", summaryData(), {
          success: true,
          data: { summary: summaryExample },
        }),
        401: componentResponse("Unauthorized"),
        403: componentResponse("Forbidden"),
        404: componentResponse("NotFound"),
      },
    },
  },
  "/api/v1/groups/{id}/summary/recompute": {
    post: {
      tags: [SUMMARY_TAG],
      summary: "Request a summary recompute",
      description:
        "Enqueues a `GROUP_SUMMARY_RECOMPUTE` background job. The recompute runs asynchronously on the worker; " +
        "this endpoint computes nothing synchronously and returns HTTP 202 with a job receipt. " +
        "If the job cannot be queued (for example, Redis is unavailable), the request fails with HTTP 500 rather than silently accepting a job that will never run. " +
        "The authenticated user must be a group member. Protected endpoint.",
      operationId: "recomputeGroupSummary",
      parameters: [groupIdPathParameter],
      responses: {
        202: jsonResponse(
          "The recompute job was accepted.",
          successEnvelope({
            type: "object",
            properties: { job: ref("QueuedJob") },
            required: ["job"],
          }),
          {
            success: true,
            data: {
              job: {
                jobId: "c9b1deb4-3b7d-4bad-9bdd-2b0d7b3dcb6d",
                type: "GROUP_SUMMARY_RECOMPUTE",
                status: "queued",
              },
            },
          },
        ),
        401: componentResponse("Unauthorized"),
        403: componentResponse("Forbidden"),
        404: componentResponse("NotFound"),
        500: componentResponse("InternalServerError"),
      },
    },
  },
};

export default summaryPaths;
