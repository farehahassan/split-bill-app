import type { PathItemObject, Schema } from "../openapi.types.js";
import {
  groupIdPathParameter,
  settlementIdPathParameter,
  idempotencyKeyHeaderParameter,
} from "../components/parameters.js";
import { jsonResponse, componentResponse, successEnvelope } from "../helpers.js";

export const SETTLEMENTS_TAG = "Settlements";

const ref = (name: string): Schema => ({ $ref: `#/components/schemas/${name}` });

const settlementData = (schemaName: string) =>
  successEnvelope({
    type: "object",
    properties: { settlement: ref(schemaName) },
    required: ["settlement"],
  });

const settlementExample = {
  id: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  groupId: "550e8400-e29b-41d4-a716-446655440000",
  payerId: "b2d9c1e0-1a2b-4c3d-9e4f-5a6b7c8d9e0f",
  payeeId: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  amountMinorUnits: 500,
  currencyCode: "PKR",
  settledAt: "2026-01-17T12:00:00.000Z",
  createdAt: "2026-01-17T12:00:00.000Z",
  updatedAt: "2026-01-17T12:00:00.000Z",
  payer: {
    id: "b2d9c1e0-1a2b-4c3d-9e4f-5a6b7c8d9e0f",
    name: "Sana Malik",
    email: "sana@example.com",
  },
  payee: {
    id: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    name: "Ahmed Raza",
    email: "ahmed@example.com",
  },
};

const settlementsPaths: Record<string, PathItemObject> = {
  "/api/v1/groups/{id}/balances": {
    get: {
      tags: [SETTLEMENTS_TAG],
      summary: "Get group balances",
      description:
        "Returns each member's net balance, derived at request time from the group's expenses, splits, and settlements. " +
        "Positive amounts are net credits (the group owes this member); negative amounts are net debts. The balances always sum to zero. " +
        "The authenticated user must be a member. Protected endpoint.",
      operationId: "getGroupBalances",
      parameters: [groupIdPathParameter],
      responses: {
        200: jsonResponse(
          "The members' net balances.",
          successEnvelope({
            type: "object",
            properties: {
              balances: { type: "array", items: ref("Balance") },
            },
            required: ["balances"],
          }),
          {
            success: true,
            data: {
              balances: [
                {
                  userId: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
                  name: "Ahmed Raza",
                  email: "ahmed@example.com",
                  amountMinorUnits: 160,
                },
                {
                  userId: "b2d9c1e0-1a2b-4c3d-9e4f-5a6b7c8d9e0f",
                  name: "Sana Malik",
                  email: "sana@example.com",
                  amountMinorUnits: -60,
                },
                {
                  userId: "7a7a7a7a-8b8b-4c4c-adad-1e1e1e1e1e1e",
                  name: "Usman Tariq",
                  email: "usman@example.com",
                  amountMinorUnits: -100,
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
  "/api/v1/groups/{id}/settlements": {
    post: {
      tags: [SETTLEMENTS_TAG],
      summary: "Record a settlement",
      description:
        "Records a payment from one member (the sender, `payerId`) to another (the receiver, `payeeId`) to settle debts. " +
        "The requester, sender, and receiver must be group members, and the sender and receiver must differ. " +
        "\n\nThis operation is **idempotency-protected**: every request must carry an `Idempotency-Key` header. " +
        "Retrying with the same key and the same body returns the originally created settlement instead of creating a duplicate; " +
        "reusing a key with a different body or by a different user returns HTTP 409. " +
        "Protected endpoint.",
      operationId: "createSettlement",
      parameters: [groupIdPathParameter, idempotencyKeyHeaderParameter],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: ref("CreateSettlementRequest"),
            example: {
              payerId: "b2d9c1e0-1a2b-4c3d-9e4f-5a6b7c8d9e0f",
              payeeId: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
              amountMinorUnits: 500,
            },
          },
        },
      },
      responses: {
        201: jsonResponse(
          "The settlement was recorded. Replaying the same `Idempotency-Key` with the same body returns the original settlement.",
          settlementData("Settlement"),
          { success: true, data: { settlement: settlementExample } },
        ),
        400: componentResponse("BadRequest"),
        401: componentResponse("Unauthorized"),
        403: componentResponse("Forbidden"),
        404: componentResponse("NotFound"),
        409: componentResponse("Conflict"),
      },
    },
    get: {
      tags: [SETTLEMENTS_TAG],
      summary: "List a group's settlements",
      description:
        "Lists the group's settlements, newest first, with the sender and receiver. " +
        "The authenticated user must be a member. Protected endpoint.",
      operationId: "listGroupSettlements",
      parameters: [groupIdPathParameter],
      responses: {
        200: jsonResponse(
          "The group's settlements.",
          successEnvelope({
            type: "object",
            properties: {
              settlements: { type: "array", items: ref("Settlement") },
            },
            required: ["settlements"],
          }),
          {
            success: true,
            data: {
              settlements: [settlementExample],
            },
          },
        ),
        401: componentResponse("Unauthorized"),
        403: componentResponse("Forbidden"),
        404: componentResponse("NotFound"),
      },
    },
  },
  "/api/v1/settlements/{id}": {
    get: {
      tags: [SETTLEMENTS_TAG],
      summary: "Get a settlement",
      description:
        "Returns a single settlement with its sender and receiver. " +
        "The authenticated user must be a member of the group the settlement belongs to (cross-group access is rejected). Protected endpoint.",
      operationId: "getSettlement",
      parameters: [settlementIdPathParameter],
      responses: {
        200: jsonResponse("The settlement.", settlementData("Settlement"), {
          success: true,
          data: { settlement: settlementExample },
        }),
        401: componentResponse("Unauthorized"),
        403: componentResponse("Forbidden"),
        404: componentResponse("NotFound"),
      },
    },
  },
};

export default settlementsPaths;
