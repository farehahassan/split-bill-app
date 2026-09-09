import type { SchemaObject } from "../openapi.types.js";

const UuidRef = { $ref: "#/components/schemas/Uuid" } as const;

export const uuidSchema: SchemaObject = {
  type: "string",
  format: "uuid",
  description: "A server-generated UUID identifier.",
  example: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
};

export const dateTimeSchema: SchemaObject = {
  type: "string",
  format: "date-time",
  description: "ISO 8601 date-time string, e.g. 2026-01-15T10:30:00.000Z.",
};

/** Integer minor-unit money (paisa), transmitted as a JSON number. */
export const minorUnitsSchema: SchemaObject = {
  type: "integer",
  description:
    "Monetary amount in the smallest currency unit (paisa). Always a whole number; the server rejects values outside the JavaScript safe-integer range so precision is never lost.",
  example: 1000,
};

export const userSchema: SchemaObject = {
  type: "object",
  description: "A user's public profile. Never includes the password hash or tokens.",
  properties: {
    id: UuidRef,
    name: { type: "string", description: "The user's display name.", example: "Ahmed Raza" },
    email: {
      type: "string",
      format: "email",
      description: "The user's email address (lower-cased).",
      example: "ahmed@example.com",
    },
  },
  required: ["id", "name", "email"],
};

export const authSessionSchema: SchemaObject = {
  type: "object",
  description: "An authenticated session issued on register/login/refresh.",
  properties: {
    user: { $ref: "#/components/schemas/User" },
    token: {
      type: "string",
      description: "Short-lived JWT access token. Send as `Authorization: Bearer <token>`.",
      example: "<access-token>",
    },
    refreshToken: {
      type: "string",
      description: "Opaque refresh token, returned only once at issuance.",
      example: "<refresh-token>",
    },
  },
  required: ["user", "token", "refreshToken"],
};

export const messageResultSchema: SchemaObject = {
  type: "object",
  properties: {
    message: { type: "string", example: "Signed out successfully." },
  },
  required: ["message"],
};

export const registerRequestSchema: SchemaObject = {
  type: "object",
  description: "Registers a new user account.",
  properties: {
    name: {
      type: "string",
      description: "Display name. Trimmed, 1-100 characters.",
      example: "Ahmed Raza",
    },
    email: {
      type: "string",
      format: "email",
      description: "Valid email address.",
      example: "ahmed@example.com",
    },
    password: {
      type: "string",
      format: "password",
      description: "At least 8 characters, at most 72 (bcrypt limit).",
      example: "a-secure-password",
    },
  },
  required: ["name", "email", "password"],
};

export const loginRequestSchema: SchemaObject = {
  type: "object",
  properties: {
    email: {
      type: "string",
      format: "email",
      example: "ahmed@example.com",
    },
    password: { type: "string", format: "password", example: "a-secure-password" },
  },
  required: ["email", "password"],
};

export const refreshTokenRequestSchema: SchemaObject = {
  type: "object",
  description: "Presents an opaque refresh token to rotate the session.",
  properties: {
    refreshToken: { type: "string", description: "A refresh token returned at issuance.", example: "<refresh-token>" },
  },
  required: ["refreshToken"],
};

export const verifyEmailRequestSchema: SchemaObject = {
  type: "object",
  description:
    "Presents the single-use token from the verification email. The plaintext token is a base64url string; only its hash is stored server-side.",
  properties: {
    token: {
      type: "string",
      description: "The token from the verification email link.",
      example: "<verification-token>",
    },
  },
  required: ["token"],
};

export const emailRequestSchema: SchemaObject = {
  type: "object",
  description:
    "An email address used by the email-resend and password-recovery flows. The endpoint answers generically so it never reveals whether the address belongs to an account.",
  properties: {
    email: { type: "string", format: "email", example: "ahmed@example.com" },
  },
  required: ["email"],
};

export const resetPasswordRequestSchema: SchemaObject = {
  type: "object",
  description:
    "Presents the single-use token from the reset email together with the new password. A successful reset revokes every existing session.",
  properties: {
    token: {
      type: "string",
      description: "The token from the password-reset email link.",
      example: "<reset-token>",
    },
    newPassword: {
      type: "string",
      format: "password",
      description: "The new password. At least 8 characters, at most 72 (bcrypt limit).",
      example: "a-new-secure-password",
    },
  },
  required: ["token", "newPassword"],
};

export const createGroupRequestSchema: SchemaObject = {
  type: "object",
  properties: {
    name: { type: "string", description: "Group name. Trimmed, non-empty.", example: "Trip to Naran" },
  },
  required: ["name"],
};

export const updateGroupRequestSchema: SchemaObject = {
  type: "object",
  properties: {
    name: { type: "string", description: "New group name. Trimmed, non-empty.", example: "Trip to Hunza" },
  },
  required: ["name"],
};

export const updateCurrentUserRequestSchema: SchemaObject = {
  type: "object",
  description:
    "Updates the authenticated user's public profile. At least one field is required. Privileged fields are never accepted.",
  properties: {
    name: {
      type: "string",
      description: "Display name. Trimmed, 1-100 characters.",
      example: "Ahmed Raza",
    },
    email: {
      type: "string",
      format: "email",
      description: "A valid, unused email address.",
      example: "ahmed@example.com",
    },
  },
};

export const addMemberRequestSchema: SchemaObject = {
  type: "object",
  properties: {
    userId: {
      type: "string",
      format: "uuid",
      description: "The user to add to the group.",
      example: "b2d9c1e0-1a2b-4c3d-9e4f-5a6b7c8d9e0f",
    },
  },
  required: ["userId"],
};

export const groupSchema: SchemaObject = {
  type: "object",
  description: "A bill-splitting group.",
  properties: {
    id: UuidRef,
    name: { type: "string", example: "Trip to Naran" },
    createdById: {
      type: "string",
      format: "uuid",
      description: "The id of the user who created the group (the owner).",
      example: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    },
    createdAt: { $ref: "#/components/schemas/DateTime" },
    updatedAt: { $ref: "#/components/schemas/DateTime" },
  },
  required: ["id", "name", "createdById", "createdAt", "updatedAt"],
};

export const groupWithMemberCountSchema: SchemaObject = {
  type: "object",
  description: "A group with its member count, as returned by the group list.",
  allOf: [
    { $ref: "#/components/schemas/Group" },
    {
      type: "object",
      properties: {
        memberCount: { type: "integer", description: "Number of members.", example: 4 },
      },
      required: ["memberCount"],
    },
  ],
};

export const groupWithMembersSchema: SchemaObject = {
  type: "object",
  description: "A group with its full member list.",
  allOf: [
    { $ref: "#/components/schemas/Group" },
    {
      type: "object",
      properties: {
        members: {
          type: "array",
          description: "The group's members. Only public user fields are returned.",
          items: { $ref: "#/components/schemas/User" },
        },
      },
      required: ["members"],
    },
  ],
};

export const groupMemberSchema: SchemaObject = {
  type: "object",
  description: "A membership record linking a user to a group.",
  properties: {
    id: UuidRef,
    groupId: {
      type: "string",
      format: "uuid",
      description: "The group the user belongs to.",
    },
    userId: {
      type: "string",
      format: "uuid",
      description: "The member user.",
    },
    createdAt: { $ref: "#/components/schemas/DateTime" },
  },
  required: ["id", "groupId", "userId", "createdAt"],
};

export const expenseSplitSchema: SchemaObject = {
  type: "object",
  description: "One participant's share of an expense.",
  properties: {
    id: UuidRef,
    userId: { type: "string", format: "uuid", description: "The split participant." },
    amountMinorUnits: {
      ...minorUnitsSchema,
      description: `${minorUnitsSchema.description} This participant's share.`,
    },
    user: { $ref: "#/components/schemas/User" },
  },
  required: ["id", "userId", "amountMinorUnits", "user"],
};

export const expenseSchema: SchemaObject = {
  type: "object",
  description: "A single expense with full split details.",
  properties: {
    id: UuidRef,
    groupId: { type: "string", format: "uuid", description: "The group that owns the expense." },
    paidById: { type: "string", format: "uuid", description: "The user who paid (the payer)." },
    description: { type: "string", example: "Dinner" },
    amountMinorUnits: {
      ...minorUnitsSchema,
      description: `${minorUnitsSchema.description} The expense total.`,
    },
    currencyCode: { type: "string", description: "ISO 4217 currency code. Always `PKR` today.", example: "PKR" },
    splitType: {
      type: "string",
      enum: ["EQUAL", "EXACT"],
      description: "How the total is divided among participants.",
    },
    expenseDate: { $ref: "#/components/schemas/DateTime" },
    payer: { $ref: "#/components/schemas/User" },
    splits: {
      type: "array",
      description: "Each participant's share.",
      items: { $ref: "#/components/schemas/ExpenseSplit" },
    },
    createdAt: { $ref: "#/components/schemas/DateTime" },
    updatedAt: { $ref: "#/components/schemas/DateTime" },
  },
  required: [
    "id",
    "groupId",
    "paidById",
    "description",
    "amountMinorUnits",
    "currencyCode",
    "splitType",
    "expenseDate",
    "payer",
    "splits",
    "createdAt",
    "updatedAt",
  ],
};

export const expenseSummarySchema: SchemaObject = {
  type: "object",
  description: "A summary view of an expense without the individual splits.",
  properties: {
    id: UuidRef,
    groupId: { type: "string", format: "uuid" },
    paidById: { type: "string", format: "uuid" },
    description: { type: "string", example: "Dinner" },
    amountMinorUnits: minorUnitsSchema,
    currencyCode: { type: "string", example: "PKR" },
    splitType: { type: "string", enum: ["EQUAL", "EXACT"] },
    expenseDate: { $ref: "#/components/schemas/DateTime" },
    payer: { $ref: "#/components/schemas/User" },
    splitCount: { type: "integer", description: "Number of participants.", example: 3 },
    createdAt: { $ref: "#/components/schemas/DateTime" },
    updatedAt: { $ref: "#/components/schemas/DateTime" },
  },
  required: [
    "id",
    "groupId",
    "paidById",
    "description",
    "amountMinorUnits",
    "currencyCode",
    "splitType",
    "expenseDate",
    "payer",
    "splitCount",
    "createdAt",
    "updatedAt",
  ],
};

export const expenseParticipantInputSchema: SchemaObject = {
  type: "object",
  description:
    "A participant in a new expense. For `EXACT` splits `amountMinorUnits` must be provided; for `EQUAL` splits it must be omitted.",
  properties: {
    userId: { type: "string", format: "uuid", description: "A group member participating in the split." },
    amountMinorUnits: {
      ...minorUnitsSchema,
      description: `${minorUnitsSchema.description} Required for EXACT splits, omitted for EQUAL splits.`,
    },
  },
  required: ["userId"],
};

export const createExpenseRequestSchema: SchemaObject = {
  type: "object",
  description:
    "Creates an expense. The requester, the payer, and every participant must be group members; the expense and its splits are persisted in one transaction.",
  properties: {
    description: {
      type: "string",
      description: "Free text. Trimmed, 1-280 characters.",
      example: "Dinner",
    },
    amountMinorUnits: {
      ...minorUnitsSchema,
      description: `${minorUnitsSchema.description} The expense total.`,
    },
    payerId: { type: "string", format: "uuid", description: "The member who paid for the expense." },
    splitType: {
      type: "string",
      enum: ["EQUAL", "EXACT"],
      description: "`EQUAL` divides the total evenly (remainder distributed to the first participants); `EXACT` uses the provided per-participant amounts.",
    },
    participants: {
      type: "array",
      minItems: 1,
      items: { $ref: "#/components/schemas/ExpenseParticipantInput" },
    },
    expenseDate: {
      type: "string",
      format: "date-time",
      description: "Optional ISO 8601 date with offset. Defaults to the server time.",
    },
  },
  required: ["description", "amountMinorUnits", "payerId", "splitType", "participants"],
};

export const updateExpenseRequestSchema: SchemaObject = {
  type: "object",
  description:
    "Partially updates an existing expense. At least one field is required. The requester must be a member of the expense's group. `currencyCode` is never editable (all expenses are `PKR`). When `participants` is omitted the existing participants are kept and equal splits are recomputed; EXACT splits without a participants change must still sum to the (possibly new) total.",
  properties: {
    description: {
      type: "string",
      description: "Free text. Trimmed, 1-280 characters.",
      example: "Dinner",
    },
    amountMinorUnits: {
      ...minorUnitsSchema,
      description: `${minorUnitsSchema.description} The new expense total.`,
    },
    payerId: { type: "string", format: "uuid", description: "The member who paid for the expense." },
    splitType: {
      type: "string",
      enum: ["EQUAL", "EXACT"],
      description: "How the total is divided among participants.",
    },
    participants: {
      type: "array",
      minItems: 1,
      description: "Replaces the participant set. Omit to keep the existing participants.",
      items: { $ref: "#/components/schemas/ExpenseParticipantInput" },
    },
    expenseDate: {
      type: "string",
      format: "date-time",
      description: "ISO 8601 date with offset.",
    },
  },
};

export const settlementSchema: SchemaObject = {
  type: "object",
  description: "A recorded payment from one member to another that settles debt.",
  properties: {
    id: UuidRef,
    groupId: { type: "string", format: "uuid" },
    payerId: { type: "string", format: "uuid", description: "The member who paid (sender)." },
    payeeId: { type: "string", format: "uuid", description: "The member who received (receiver)." },
    amountMinorUnits: minorUnitsSchema,
    currencyCode: { type: "string", example: "PKR" },
    settledAt: { $ref: "#/components/schemas/DateTime" },
    createdAt: { $ref: "#/components/schemas/DateTime" },
    updatedAt: { $ref: "#/components/schemas/DateTime" },
    payer: { $ref: "#/components/schemas/User" },
    payee: { $ref: "#/components/schemas/User" },
  },
  required: [
    "id",
    "groupId",
    "payerId",
    "payeeId",
    "amountMinorUnits",
    "currencyCode",
    "settledAt",
    "createdAt",
    "updatedAt",
    "payer",
    "payee",
  ],
};

export const createSettlementRequestSchema: SchemaObject = {
  type: "object",
  description: "Records a settlement. Requires an `Idempotency-Key` header. Sender and receiver must differ.",
  properties: {
    payerId: { type: "string", format: "uuid", description: "The sending member." },
    payeeId: { type: "string", format: "uuid", description: "The receiving member, different from `payerId`." },
    amountMinorUnits: minorUnitsSchema,
  },
  required: ["payerId", "payeeId", "amountMinorUnits"],
};

export const balanceSchema: SchemaObject = {
  type: "object",
  description:
    "A member's net balance for a group. Positive values are net credits (the group owes this user); negative values are net debts. The balances always sum to zero.",
  properties: {
    userId: { type: "string", format: "uuid" },
    name: { type: "string", example: "Ahmed Raza" },
    email: { type: "string", format: "email", example: "ahmed@example.com" },
    amountMinorUnits: {
      type: "integer",
      description: "Net balance in minor units. May be negative (net debtor) or positive (net creditor).",
      example: -60,
    },
  },
  required: ["userId", "name", "email", "amountMinorUnits"],
};

export const activityEventSchema: SchemaObject = {
  type: "object",
  description: "An auditable activity event in a group's feed. Not a source of truth for balances.",
  properties: {
    id: UuidRef,
    groupId: { type: "string", format: "uuid" },
    userId: { type: "string", format: "uuid", description: "The user who performed the action (the actor)." },
    type: {
      type: "string",
      enum: [
        "EXPENSE_ADDED",
        "EXPENSE_UPDATED",
        "EXPENSE_DELETED",
        "SETTLEMENT_ADDED",
        "GROUP_CREATED",
        "GROUP_UPDATED",
        "MEMBER_ADDED",
        "MEMBER_REMOVED",
      ],
    },
    message: { type: "string", example: "added the expense \"Dinner\"" },
    amountMinorUnits: {
      ...minorUnitsSchema,
      nullable: true,
      description: `${minorUnitsSchema.description} Present only for financial events; ` +
        "`null` for group and membership events.",
    },
    currencyCode: { type: "string", nullable: true, example: "PKR" },
    occurredAt: { $ref: "#/components/schemas/DateTime" },
    createdAt: { $ref: "#/components/schemas/DateTime" },
    user: { $ref: "#/components/schemas/User" },
  },
  required: [
    "id",
    "groupId",
    "userId",
    "type",
    "message",
    "amountMinorUnits",
    "currencyCode",
    "occurredAt",
    "createdAt",
    "user",
  ],
};

export const paginationSchema: SchemaObject = {
  type: "object",
  description: "Pagination metadata returned by paginated list endpoints.",
  properties: {
    page: { type: "integer", description: "The 1-based page number returned.", example: 1 },
    limit: { type: "integer", description: "The number of items per page.", example: 20 },
    total: { type: "integer", description: "Total number of items across all pages.", example: 42 },
  },
  required: ["page", "limit", "total"],
};

export const groupSummarySchema: SchemaObject = {
  type: "object",
  description: "A derived, non-authoritative summary snapshot of a group, computed by the background worker.",
  properties: {
    id: UuidRef,
    groupId: { type: "string", format: "uuid" },
    totalSpentMinorUnits: {
      ...minorUnitsSchema,
      description: `${minorUnitsSchema.description} Total spent in the group across all expenses.`,
    },
    expenseCount: { type: "integer", example: 12 },
    settlementCount: { type: "integer", example: 3 },
    memberCount: { type: "integer", example: 5 },
    currencyCode: { type: "string", example: "PKR" },
    computedAt: { $ref: "#/components/schemas/DateTime" },
  },
  required: [
    "id",
    "groupId",
    "totalSpentMinorUnits",
    "expenseCount",
    "settlementCount",
    "memberCount",
    "currencyCode",
    "computedAt",
  ],
};

export const queuedJobSchema: SchemaObject = {
  type: "object",
  description: "A receipt for a background job accepted by the server.",
  properties: {
    jobId: { type: "string", format: "uuid", description: "The enqueued job's id." },
    type: { type: "string", enum: ["GROUP_SUMMARY_RECOMPUTE"], description: "The job type." },
    status: { type: "string", enum: ["queued"], description: "Always `queued`: the job runs asynchronously." },
  },
  required: ["jobId", "type", "status"],
};

export const errorBodySchema: SchemaObject = {
  type: "object",
  description: "The standard API error envelope.",
  properties: {
    success: { type: "boolean", enum: [false], description: "Always false for error responses." },
    message: { type: "string", description: "A human-readable error description.", example: "Group not found." },
    errors: {
      type: "array",
      description: "Field-level validation failures. Present only for Zod validation errors (HTTP 400).",
      items: {
        type: "object",
        properties: {
          field: { type: "string", description: "Dotted path of the invalid field.", example: "body.email" },
          message: { type: "string", example: "Invalid email address" },
        },
        required: ["field", "message"],
      },
    },
  },
  required: ["success", "message"],
};

export const livenessResponseSchema: SchemaObject = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["ok"], description: "Always `ok` while the process is running." },
  },
  required: ["status"],
};

export const readinessReadyResponseSchema: SchemaObject = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["ready"] },
  },
  required: ["status"],
};

export const readinessUnavailableResponseSchema: SchemaObject = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["unavailable"] },
    message: { type: "string", description: "Why the service is not ready.", example: "Service is not ready yet." },
  },
  required: ["status", "message"],
};