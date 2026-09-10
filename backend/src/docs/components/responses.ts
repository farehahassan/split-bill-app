import type { ResponseObject } from "../openapi.types.js";
import { jsonContent } from "../helpers.js";

const errorContent = (example: unknown) =>
  jsonContent({ $ref: "#/components/schemas/ErrorBody" }, example);

export const badRequestResponse: ResponseObject = {
  description:
    "Bad request. The body, query, or path parameters failed validation, or an `Idempotency-Key` header is missing/invalid. Field-level details are present when the failure is a Zod validation error.",
  content: {
    "application/json": errorContent({
      success: false,
      message: "Validation failed",
      errors: [{ field: "body.email", message: "Invalid email address" }],
    }),
  },
};

export const unauthorizedResponse: ResponseObject = {
  description:
    "Unauthorized. The access token is missing, malformed, invalid, expired, or the authenticated user no longer exists on `me`.",
  content: {
    "application/json": errorContent({
      success: false,
      message: "Invalid or malformed token.",
    }),
  },
};

export const forbiddenResponse: ResponseObject = {
  description:
    "Forbidden. The authenticated user is allowed to access the token but not this resource (e.g. they are not a group member or not the group owner).",
  content: {
    "application/json": errorContent({
      success: false,
      message: "You are not a member of this group.",
    }),
  },
};

export const notFoundResponse: ResponseObject = {
  description: "Not found. The resource does not exist (or no summary has been computed yet).",
  content: {
    "application/json": errorContent({
      success: false,
      message: "Group not found.",
    }),
  },
};

export const conflictResponse: ResponseObject = {
  description:
    "Conflict. The request conflicts with the current resource state (duplicate email/membership, idempotency-key misuse, ownership constraints, or a concurrent settlement lock).",
  content: {
    "application/json": errorContent({
      success: false,
      message: "Another settlement for this group is being processed. Please retry shortly.",
    }),
  },
};

export const payloadTooLargeResponse: ResponseObject = {
  description: "Payload too large. The request body exceeds the configured 10 MB limit.",
  content: {
    "application/json": errorContent({
      success: false,
      message: "Request body too large.",
    }),
  },
};

export const tooManyRequestsResponse: ResponseObject = {
  description: "Too many requests. The client IP exceeded the rate limit for this window.",
  content: {
    "application/json": errorContent({
      success: false,
      message: "Too many requests",
    }),
  },
};

export const internalServerErrorResponse: ResponseObject = {
  description:
    "Internal server error. An unexpected failure occurred (including a job enqueue failure when Redis is unavailable). Stack traces are never exposed.",
  content: {
    "application/json": errorContent({
      success: false,
      message: "Something went wrong on our side. Please try again later.",
    }),
  },
};

export const serviceUnavailableResponse: ResponseObject = {
  description: "Service unavailable. A dependency (such as the database) is not reachable.",
  content: {
    "application/json": errorContent({
      success: false,
      message: "Service is not ready yet.",
    }),
  },
};

export const noContentResponse: ResponseObject = {
  description: "No Content. The operation succeeded and there is no response body.",
};
