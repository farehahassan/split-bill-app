import { createRequire } from "node:module";

import type { OpenApiDocument } from "./openapi.types.js";
import {
  authSessionSchema,
  addMemberRequestSchema,
  activityEventSchema,
  balanceSchema,
  createExpenseRequestSchema,
  createGroupRequestSchema,
  createSettlementRequestSchema,
  dateTimeSchema,
  errorBodySchema,
  expenseParticipantInputSchema,
  expenseSchema,
  expenseSplitSchema,
  expenseSummarySchema,
  groupMemberSchema,
  groupSchema,
  groupSummarySchema,
  groupWithMemberCountSchema,
  groupWithMembersSchema,
  livenessResponseSchema,
  loginRequestSchema,
  messageResultSchema,
  minorUnitsSchema,
  paginationSchema,
  queuedJobSchema,
  readinessReadyResponseSchema,
  readinessUnavailableResponseSchema,
  refreshTokenRequestSchema,
  registerRequestSchema,
  settlementSchema,
  updateCurrentUserRequestSchema,
  updateExpenseRequestSchema,
  updateGroupRequestSchema,
  userSchema,
  uuidSchema,
} from "./components/schemas.js";
import {
  badRequestResponse,
  conflictResponse,
  forbiddenResponse,
  internalServerErrorResponse,
  noContentResponse,
  notFoundResponse,
  payloadTooLargeResponse,
  serviceUnavailableResponse,
  tooManyRequestsResponse,
  unauthorizedResponse,
} from "./components/responses.js";
import {
  expenseIdPathParameter,
  groupIdPathParameter,
  idempotencyKeyHeaderParameter,
  limitQueryParameter,
  memberIdPathParameter,
  pageQueryParameter,
  settlementIdPathParameter,
} from "./components/parameters.js";
import { bearerAuthSecurityScheme } from "./components/security.js";
import authPaths from "./paths/auth.js";
import groupsPaths from "./paths/groups.js";
import expensesPaths from "./paths/expenses.js";
import settlementsPaths from "./paths/settlements.js";
import activityPaths from "./paths/activity.js";
import summaryPaths from "./paths/summary.js";
import healthPaths from "./paths/health.js";
import metricsPaths from "./paths/metrics.js";

const require = createRequire(import.meta.url);
const packageJson = require("../../package.json") as { version: string };

const API_DOCUMENTATION_DESCRIPTION = `REST API for the Hisab split-bill application. All feature endpoints live under \`/api/v1\` and exchange JSON.

## Authentication

Most endpoints require a bearer access token: \`Authorization: Bearer <access-token>\`. The token is a short-lived JWT obtained from \`POST /api/v1/auth/register\` or \`POST /api/v1/auth/login\`. When an access token expires, \`POST /api/v1/auth/refresh\` exchanges a refresh token for a new access token and rotates the refresh token in the same atomic operation. \`POST /api/v1/auth/logout\` revokes the presented refresh-token session.

Public endpoints (registration, login, refresh, logout, health checks, and metrics) do not require a token.

## Response envelope

Successful responses use \`{ "success": true, "data": ... }\`. Operations that delete a resource return HTTP 204 with no body. Errors use \`{ "success": false, "message": "..." }\`; field-level validation failures add an \`errors\` array with \`field\`/\`message\` entries.

## Money

All monetary values are transmitted as JSON numbers representing whole minor units (paisa), mirroring the database's PostgreSQL \`BIGINT\`/Prisma \`BigInt\` columns. The server validates that every amount is a safe integer, so values never lose precision to floating-point arithmetic.

## Pagination

\`GET /api/v1/groups/{id}/activity\` is paginated with \`page\` (1-based, default 1) and \`limit\` (default 20, maximum 50). Paginated responses include a \`pagination\` object with \`page\`, \`limit\`, and \`total\`.

## Idempotency

\`POST /api/v1/groups/{id}/settlements\` requires an \`Idempotency-Key\` header (8-128 characters, letters/digits/\`_\`/\`-\`/\`.\`) so network retries cannot create duplicate settlements. Replaying the same key with the same request body returns the originally created settlement; reusing a key with a different body or by a different user returns HTTP 409.
`;

let cachedDocument: OpenApiDocument | null = null;

/** Builds the complete OpenAPI document once and caches it for the process lifetime. */
export function createOpenApiDocument(): OpenApiDocument {
  if (cachedDocument) {
    return cachedDocument;
  }

  const document: OpenApiDocument = {
    openapi: "3.0.3",
    info: {
      title: "Hisab Split Bill API",
      description: API_DOCUMENTATION_DESCRIPTION,
      version: packageJson.version,
    },
    servers: [{ url: "/", description: "Same origin as the documentation UI (the running backend)." }],
    tags: [
      { name: "Health", description: "Liveness and readiness probes." },
      { name: "Metrics", description: "Prometheus metrics endpoint." },
      { name: "Authentication", description: "Register, login, session refresh, and logout." },
      { name: "Groups", description: "Groups and memberships." },
      { name: "Expenses", description: "Expenses and split calculation." },
      { name: "Settlements", description: "Group balances and settlements." },
      { name: "Activity", description: "Group activity feed." },
      { name: "Group Summary", description: "Derived group summary snapshots." },
    ],
    paths: {
      ...healthPaths,
      ...metricsPaths,
      ...authPaths,
      ...groupsPaths,
      ...expensesPaths,
      ...settlementsPaths,
      ...activityPaths,
      ...summaryPaths,
    },
    components: {
      schemas: {
        Uuid: uuidSchema,
        DateTime: dateTimeSchema,
        MinorUnits: minorUnitsSchema,
        User: userSchema,
        AuthSession: authSessionSchema,
        MessageResult: messageResultSchema,
        RegisterRequest: registerRequestSchema,
        LoginRequest: loginRequestSchema,
        RefreshTokenRequest: refreshTokenRequestSchema,
        UpdateCurrentUserRequest: updateCurrentUserRequestSchema,
        CreateGroupRequest: createGroupRequestSchema,
        UpdateGroupRequest: updateGroupRequestSchema,
        AddMemberRequest: addMemberRequestSchema,
        Group: groupSchema,
        GroupWithMemberCount: groupWithMemberCountSchema,
        GroupWithMembers: groupWithMembersSchema,
        GroupMember: groupMemberSchema,
        ExpenseSplit: expenseSplitSchema,
        ExpenseParticipantInput: expenseParticipantInputSchema,
        CreateExpenseRequest: createExpenseRequestSchema,
        UpdateExpenseRequest: updateExpenseRequestSchema,
        Expense: expenseSchema,
        ExpenseSummary: expenseSummarySchema,
        Settlement: settlementSchema,
        CreateSettlementRequest: createSettlementRequestSchema,
        Balance: balanceSchema,
        ActivityEvent: activityEventSchema,
        Pagination: paginationSchema,
        GroupSummary: groupSummarySchema,
        QueuedJob: queuedJobSchema,
        ErrorBody: errorBodySchema,
        LivenessResponse: livenessResponseSchema,
        ReadinessReadyResponse: readinessReadyResponseSchema,
        ReadinessUnavailableResponse: readinessUnavailableResponseSchema,
      },
      responses: {
        NoContent: noContentResponse,
        BadRequest: badRequestResponse,
        Unauthorized: unauthorizedResponse,
        Forbidden: forbiddenResponse,
        NotFound: notFoundResponse,
        Conflict: conflictResponse,
        PayloadTooLarge: payloadTooLargeResponse,
        TooManyRequests: tooManyRequestsResponse,
        InternalServerError: internalServerErrorResponse,
        ServiceUnavailable: serviceUnavailableResponse,
      },
      parameters: {
        GroupIdPath: groupIdPathParameter,
        ExpenseIdPath: expenseIdPathParameter,
        SettlementIdPath: settlementIdPathParameter,
        MemberIdPath: memberIdPathParameter,
        PageQuery: pageQueryParameter,
        LimitQuery: limitQueryParameter,
        IdempotencyKeyHeader: idempotencyKeyHeaderParameter,
      },
      securitySchemes: {
        bearerAuth: bearerAuthSecurityScheme,
      },
    },
    security: [{ bearerAuth: [] }],
  };

  cachedDocument = document;
  return cachedDocument;
}

/** The cached OpenAPI document. Analogue of `getEnv`/`getRedis` accessors in the rest of the backend. */
export function getOpenApiDocument(): OpenApiDocument {
  if (!cachedDocument) {
    return createOpenApiDocument();
  }
  return cachedDocument;
}