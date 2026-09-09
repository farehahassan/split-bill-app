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

const message = (description: string, example: string) =>
  jsonResponse(description, successEnvelope(ref("MessageResult")), {
    success: true,
    data: { message: example },
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
    patch: {
      tags: [AUTH_TAG],
      summary: "Update the current user",
      description:
        "Updates the authenticated user's public profile. At least one of `name` or `email` is required; " +
        "both may be supplied. The email must be unused by another account. " +
        "Privileged fields are rejected outright. Protected endpoint.",
      operationId: "updateCurrentUser",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: ref("UpdateCurrentUserRequest"),
            example: { name: "Ahmed Raza" },
          },
        },
      },
      responses: {
        200: jsonResponse(
          "The updated profile.",
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
        400: componentResponse("BadRequest"),
        401: componentResponse("Unauthorized"),
        404: componentResponse("NotFound"),
        409: componentResponse("Conflict"),
      },
    },
  },
  "/api/v1/auth/verify-email": {
    post: {
      tags: [AUTH_TAG],
      summary: "Verify an email address",
      description:
        "Confirms a user's email address using the single-use token from the verification email. " +
        "A token can be used exactly once and expires after the configured TTL. " +
        "Invalid, expired, and already-used tokens each return 401. Public endpoint.",
      operationId: "verifyEmailAddress",
      security: [],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: ref("VerifyEmailRequest"),
            example: { token: "<verification-token>" },
          },
        },
      },
      responses: {
        200: message("The email address was verified.", "Email verified successfully."),
        400: componentResponse("BadRequest"),
        401: componentResponse("Unauthorized"),
      },
    },
  },
  "/api/v1/auth/resend-verification": {
    post: {
      tags: [AUTH_TAG],
      summary: "Resend the verification email",
      description:
        "Sends a fresh verification email for the given address. The previous verification link for that account stops working. " +
        "The endpoint returns the same success message whether or not the address belongs to an account (no account enumeration), " +
        "and never reveals whether the requested account is already verified. Email delivery is best-effort. Public endpoint.",
      operationId: "resendVerificationEmail",
      security: [],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: ref("EmailRequest"),
            example: { email: "ahmed@example.com" },
          },
        },
      },
      responses: {
        200: message(
          "Accepted. A verification email is sent when the address belongs to an unverified account.",
          "If that email address belongs to an account, a verification email is on its way.",
        ),
        400: componentResponse("BadRequest"),
      },
    },
  },
  "/api/v1/auth/forgot-password": {
    post: {
      tags: [AUTH_TAG],
      summary: "Request a password reset",
      description:
        "Sends a single-use password-reset email for the given address if it belongs to an account. A previous reset link for that account stops working. " +
        "The endpoint returns the same success message whether or not the address belongs to an account (no account enumeration). " +
        "Email delivery is best-effort. Public endpoint.",
      operationId: "requestPasswordReset",
      security: [],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: ref("EmailRequest"),
            example: { email: "ahmed@example.com" },
          },
        },
      },
      responses: {
        200: message(
          "Accepted. A password-reset email is sent when the address belongs to an account.",
          "If that email address belongs to an account, a password reset email is on its way.",
        ),
        400: componentResponse("BadRequest"),
      },
    },
  },
  "/api/v1/auth/reset-password": {
    post: {
      tags: [AUTH_TAG],
      summary: "Reset a password",
      description:
        "Sets a new password using the single-use token from the reset email. The token can be used exactly once and expires after the configured TTL; " +
        "a successful reset revokes every existing session (all refresh tokens) for the user. Public endpoint.",
      operationId: "resetUserPassword",
      security: [],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: ref("ResetPasswordRequest"),
            example: { token: "<reset-token>", newPassword: "a-new-secure-password" },
          },
        },
      },
      responses: {
        200: message(
          "The password was changed and all existing sessions were revoked.",
          "Your password has been reset. Please sign in with your new password.",
        ),
        400: componentResponse("BadRequest"),
        401: componentResponse("Unauthorized"),
      },
    },
  },
};

export default authPaths;