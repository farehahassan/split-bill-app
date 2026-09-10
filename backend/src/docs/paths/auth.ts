import type { PathItemObject } from "../openapi.types.js";
import { jsonResponse, componentResponse, successEnvelope } from "../helpers.js";
import type { Schema } from "../openapi.types.js";

export const AUTH_TAG = "Authentication";

const ref = (name: string): Schema => ({ $ref: `#/components/schemas/${name}` });

const session = (description: string, example: unknown) =>
  jsonResponse(description, successEnvelope(ref("AuthSession")), {
    success: true,
    data: example,
  });

const authPaths: Record<string, PathItemObject> = {
  "/api/v1/auth/register": {
    post: {
      tags: [AUTH_TAG],
      summary: "Register a new user",
      description:
        "Creates a user account and returns an authenticated session (JWT access token plus opaque refresh token). " +
        "Public endpoint - no authorization header required.",
      operationId: "registerUser",
      security: [],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: ref("RegisterRequest"),
            example: {
              name: "Ahmed Raza",
              email: "ahmed@example.com",
              password: "a-secure-password",
            },
          },
        },
      },
      responses: {
        201: session("The user was created and the session is issued.", {
          user: {
            id: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
            name: "Ahmed Raza",
            email: "ahmed@example.com",
          },
          token: "<access-token>",
          refreshToken: "<refresh-token>",
        }),
        400: componentResponse("BadRequest"),
        409: componentResponse("Conflict"),
      },
    },
  },
  "/api/v1/auth/login": {
    post: {
      tags: [AUTH_TAG],
      summary: "Log in",
      description:
        "Authenticates with email and password and returns an authenticated session. " +
        "Public endpoint. Uses a single generic `INVALID_CREDENTIALS` error so responses never reveal whether an email exists.",
      operationId: "loginUser",
      security: [],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: ref("LoginRequest"),
            example: { email: "ahmed@example.com", password: "a-secure-password" },
          },
        },
      },
      responses: {
        200: session("The session is issued.", {
          user: {
            id: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
            name: "Ahmed Raza",
            email: "ahmed@example.com",
          },
          token: "<access-token>",
          refreshToken: "<refresh-token>",
        }),
        400: componentResponse("BadRequest"),
        401: componentResponse("Unauthorized"),
      },
    },
  },
  "/api/v1/auth/refresh": {
    post: {
      tags: [AUTH_TAG],
      summary: "Refresh an access token",
      description:
        "Exchanges a valid refresh token for a new access token and a rotated refresh token in a single atomic session rotation. " +
        "The presented refresh token is immediately revoked, so replaying an already-rotated token is rejected. " +
        "Public endpoint.",
      operationId: "refreshSession",
      security: [],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: ref("RefreshTokenRequest"),
            example: { refreshToken: "<refresh-token>" },
          },
        },
      },
      responses: {
        200: session("The session is rotated.", {
          user: {
            id: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
            name: "Ahmed Raza",
            email: "ahmed@example.com",
          },
          token: "<access-token>",
          refreshToken: "<new-refresh-token>",
        }),
        400: componentResponse("BadRequest"),
        401: componentResponse("Unauthorized"),
      },
    },
  },
  "/api/v1/auth/logout": {
    post: {
      tags: [AUTH_TAG],
      summary: "Log out",
      description:
        "Revokes the session identified by the presented refresh token. Idempotent: an unknown, expired, or already-revoked token still succeeds and changes nothing. " +
        "Only the presented session is revoked; no user id is accepted. Public endpoint.",
      operationId: "logoutUser",
      security: [],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: ref("RefreshTokenRequest"),
            example: { refreshToken: "<refresh-token>" },
          },
        },
      },
      responses: {
        200: jsonResponse(
          "The session was revoked (or had no effect).",
          successEnvelope(ref("MessageResult")),
          { success: true, data: { message: "Signed out successfully." } },
        ),
        400: componentResponse("BadRequest"),
      },
    },
  },
  "/api/v1/auth/me": {
    get: {
      tags: [AUTH_TAG],
      summary: "Get the current user",
      description:
        "Returns the public profile of the user identified by the bearer access token. Protected endpoint.",
      operationId: "getCurrentUser",
      responses: {
        200: jsonResponse(
          "The authenticated user's profile.",
          successEnvelope({
            type: "object",
            properties: { user: ref("User") },
            required: ["user"],
          }),
          {
            success: true,
            data: {
              user: {
                id: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
                name: "Ahmed Raza",
                email: "ahmed@example.com",
              },
            },
          },
        ),
        401: componentResponse("Unauthorized"),
        404: componentResponse("NotFound"),
      },
    },
  },
};

export default authPaths;
