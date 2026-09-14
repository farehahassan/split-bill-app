import type { SecuritySchemeObject } from "../openapi.types.js";

/** Bearer JWT access-token authentication, used by every protected endpoint. */
export const bearerAuthSecurityScheme: SecuritySchemeObject = {
  type: "http",
  scheme: "bearer",
  bearerFormat: "JWT",
  description:
    "Short-lived JSON Web Token issued by `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, or `POST /api/v1/auth/refresh`. " +
    "Send it as `Authorization: Bearer <access-token>`. Expired tokens must be refreshed; sessions are rotated on refresh.",
};
