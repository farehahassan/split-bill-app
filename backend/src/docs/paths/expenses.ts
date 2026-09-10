import type { PathItemObject, Schema } from "../openapi.types.js";
import { groupIdPathParameter, expenseIdPathParameter } from "../components/parameters.js";
import { jsonResponse, componentResponse, successEnvelope } from "../helpers.js";

export const EXPENSES_TAG = "Expenses";

const ref = (name: string): Schema => ({ $ref: `#/components/schemas/${name}` });

const expenseData = (schemaName: string) =>
  successEnvelope({
    type: "object",
    properties: { expense: ref(schemaName) },
    required: ["expense"],
  });

const expenseExample = {
  id: "4c2a0f8e-9d31-4b6e-8b7a-5d5d5d5d5d5d",
  groupId: "550e8400-e29b-41d4-a716-446655440000",
  paidById: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  description: "Dinner",
  amountMinorUnits: 1000,
  currencyCode: "PKR",
  splitType: "EQUAL",
  expenseDate: "2026-01-15T18:30:00.000Z",
  payer: {
    id: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    name: "Ahmed Raza",
    email: "ahmed@example.com",
  },
  splits: [
    {
      id: "1a1a1a1a-2b2b-4c4c-8d8d-5e5e5e5e5e5e",
      userId: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
      amountMinorUnits: 334,
      user: {
        id: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
        name: "Ahmed Raza",
        email: "ahmed@example.com",
      },
    },
    {
      id: "2b2b2b2b-3c3c-4d4d-9e9e-6f6f6f6f6f6f",
      userId: "b2d9c1e0-1a2b-4c3d-9e4f-5a6b7c8d9e0f",
      amountMinorUnits: 333,
      user: {
        id: "b2d9c1e0-1a2b-4c3d-9e4f-5a6b7c8d9e0f",
        name: "Sana Malik",
        email: "sana@example.com",
      },
    },
    {
      id: "3c3c3c3c-4d4d-4e4e-afaf-707070707070",
      userId: "7a7a7a7a-8b8b-4c4c-adad-1e1e1e1e1e1e",
      amountMinorUnits: 333,
      user: {
        id: "7a7a7a7a-8b8b-4c4c-adad-1e1e1e1e1e1e",
        name: "Usman Tariq",
        email: "usman@example.com",
      },
    },
  ],
  createdAt: "2026-01-15T18:35:00.000Z",
  updatedAt: "2026-01-15T18:35:00.000Z",
};

const expensesPaths: Record<string, PathItemObject> = {
  "/api/v1/groups/{id}/expenses": {
    post: {
      tags: [EXPENSES_TAG],
      summary: "Create an expense",
      description:
        "Creates an expense and its splits inside a single transaction, and records an `EXPENSE_ADDED` activity event. " +
        "The requester, the payer, and every participant must be members of the group. `EQUAL` splits divide the total evenly " +
        "(any remainder in the smallest currency unit is assigned to the first participants); `EXACT` splits must sum to the total. " +
        "Protected endpoint.",
      operationId: "createExpense",
      parameters: [groupIdPathParameter],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: ref("CreateExpenseRequest"),
            example: {
              description: "Dinner",
              amountMinorUnits: 1000,
              payerId: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
              splitType: "EQUAL",
              participants: [
                { userId: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d" },
                { userId: "b2d9c1e0-1a2b-4c3d-9e4f-5a6b7c8d9e0f" },
                { userId: "7a7a7a7a-8b8b-4c4c-adad-1e1e1e1e1e1e" },
              ],
              expenseDate: "2026-01-15T18:30:00.000Z",
            },
          },
        },
      },
      responses: {
        201: jsonResponse("The expense was created with its splits.", expenseData("Expense"), {
          success: true,
          data: { expense: expenseExample },
        }),
        400: componentResponse("BadRequest"),
        401: componentResponse("Unauthorized"),
        403: componentResponse("Forbidden"),
        404: componentResponse("NotFound"),
      },
    },
    get: {
      tags: [EXPENSES_TAG],
      summary: "List a group's expenses",
      description:
        "Lists the group's expenses, newest first, with the payer and a split count (individual splits are omitted). " +
        "The authenticated user must be a member. Protected endpoint.",
      operationId: "listGroupExpenses",
      parameters: [groupIdPathParameter],
      responses: {
        200: jsonResponse(
          "The group's expenses.",
          successEnvelope({
            type: "object",
            properties: {
              expenses: { type: "array", items: ref("ExpenseSummary") },
            },
            required: ["expenses"],
          }),
          {
            success: true,
            data: {
              expenses: [
                {
                  id: "4c2a0f8e-9d31-4b6e-8b7a-5d5d5d5d5d5d",
                  groupId: "550e8400-e29b-41d4-a716-446655440000",
                  paidById: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
                  description: "Dinner",
                  amountMinorUnits: 1000,
                  currencyCode: "PKR",
                  splitType: "EQUAL",
                  expenseDate: "2026-01-15T18:30:00.000Z",
                  payer: {
                    id: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
                    name: "Ahmed Raza",
                    email: "ahmed@example.com",
                  },
                  splitCount: 3,
                  createdAt: "2026-01-15T18:35:00.000Z",
                  updatedAt: "2026-01-15T18:35:00.000Z",
                },
              ],
            },
          },
        ),
        401: componentResponse("Unauthorized"),
        403: componentResponse("Forbidden"),
        404: componentResponse("NotFound"),
      },
    },
  },
  "/api/v1/expenses/{id}": {
    get: {
      tags: [EXPENSES_TAG],
      summary: "Get an expense",
      description:
        "Returns a single expense with its full split details and each participant's public profile. " +
        "The authenticated user must be a member of the group the expense belongs to. Protected endpoint.",
      operationId: "getExpense",
      parameters: [expenseIdPathParameter],
      responses: {
        200: jsonResponse("The expense with its splits.", expenseData("Expense"), {
          success: true,
          data: { expense: expenseExample },
        }),
        401: componentResponse("Unauthorized"),
        403: componentResponse("Forbidden"),
        404: componentResponse("NotFound"),
      },
    },
  },
};

export default expensesPaths;
