import type { ParameterObject } from "../openapi.types.js";

const uuidPathParameter = (name: string, resource: string): ParameterObject => ({
  name,
  in: "path",
  required: true,
  description: `The ${resource}`,
  schema: { type: "string", format: "uuid" },
});

export const groupIdPathParameter: ParameterObject = uuidPathParameter(
  "id",
  "group's UUID identifier.",
);

export const expenseIdPathParameter: ParameterObject = uuidPathParameter(
  "id",
  "expense's UUID identifier.",
);

export const settlementIdPathParameter: ParameterObject = uuidPathParameter(
  "id",
  "settlement's UUID identifier.",
);

export const memberIdPathParameter: ParameterObject = uuidPathParameter(
  "memberId",
  "membership record's UUID identifier.",
);

export const pageQueryParameter: ParameterObject = {
  name: "page",
  in: "query",
  description: "The 1-based page number to return.",
  schema: {
    type: "integer",
    minimum: 1,
    default: 1,
  },
};

export const limitQueryParameter: ParameterObject = {
  name: "limit",
  in: "query",
  description: "The number of items per page.",
  schema: {
    type: "integer",
    minimum: 1,
    maximum: 50,
    default: 20,
  },
};

export const idempotencyKeyHeaderParameter: ParameterObject = {
  name: "Idempotency-Key",
  in: "header",
  required: true,
  description:
    "A client-generated key (8-128 characters: letters, digits, underscore, hyphen, or dot) that makes retries idempotent. Reuse the same key for retries of the same request; never reuse it for a different request.",
  schema: {
    type: "string",
    minLength: 8,
    maxLength: 128,
    pattern: "^[A-Za-z0-9._-]+$",
  },
  example: "9f8e7d6c-5b4a-3928-1706",
};
