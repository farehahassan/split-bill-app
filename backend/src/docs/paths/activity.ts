import type { PathItemObject, Schema } from "../openapi.types.js";
import {
  groupIdPathParameter,
  pageQueryParameter,
  limitQueryParameter,
} from "../components/parameters.js";
import { jsonResponse, componentResponse } from "../helpers.js";

export const ACTIVITY_TAG = "Activity";

const ref = (name: string): Schema => ({ $ref: `#/components/schemas/${name}` });

const activityPaths: Record<string, PathItemObject> = {
  "/api/v1/groups/{id}/activity": {
    get: {
      tags: [ACTIVITY_TAG],
      summary: "List a group's activity",
      description:
        "Returns a paginated, newest-first feed of the group's activity events (group created, member added, expense added, settlement added). " +
        "Events are filtered and paginated at the database level. The authenticated user must be a group member. Protected endpoint.",
      operationId: "listGroupActivity",
      parameters: [groupIdPathParameter, pageQueryParameter, limitQueryParameter],
      responses: {
        200: jsonResponse(
          "A page of activity events with pagination metadata.",
          {
            type: "object",
            properties: {
              success: { type: "boolean", enum: [true] },
              data: {
                type: "object",
                properties: {
                  events: { type: "array", items: ref("ActivityEvent") },
                },
                required: ["events"],
              },
              pagination: { $ref: "#/components/schemas/Pagination" },
            },
            required: ["success", "data", "pagination"],
          },
          {
            success: true,
            data: {
              events: [
                {
                  id: "d3d29d70-1d25-11ec-9621-0242ac130002",
                  groupId: "550e8400-e29b-41d4-a716-446655440000",
                  userId: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
                  type: "EXPENSE_ADDED",
                  message: 'added the expense "Dinner"',
                  amountMinorUnits: 1000,
                  currencyCode: "PKR",
                  occurredAt: "2026-01-15T18:35:00.000Z",
                  createdAt: "2026-01-15T18:35:00.000Z",
                  user: {
                    id: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
                    name: "Ahmed Raza",
                    email: "ahmed@example.com",
                  },
                },
              ],
            },
            pagination: { page: 1, limit: 20, total: 42 },
          },
        ),
        400: componentResponse("BadRequest"),
        401: componentResponse("Unauthorized"),
        403: componentResponse("Forbidden"),
        404: componentResponse("NotFound"),
      },
    },
  },
};

export default activityPaths;
