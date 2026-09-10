import type { PathItemObject } from "../openapi.types.js";
import { jsonResponse } from "../helpers.js";

export const HEALTH_TAG = "Health";

const healthPaths: Record<string, PathItemObject> = {
  "/health": {
    get: {
      tags: [HEALTH_TAG],
      summary: "Liveness probe",
      description:
        'Returns HTTP 200 with `{ "status": "ok" }` whenever the process is running. ' +
        "Performs no dependency checks and requires no authentication.",
      operationId: "getLiveness",
      security: [],
      responses: {
        200: jsonResponse(
          "The server is running.",
          { $ref: "#/components/schemas/LivenessResponse" },
          { status: "ok" },
        ),
      },
    },
  },
  "/health/ready": {
    get: {
      tags: [HEALTH_TAG],
      summary: "Readiness probe",
      description:
        'Verifies that the PostgreSQL database is reachable. Returns 200 with `{ "status": "ready" }` ' +
        'when the database responds, or 503 with `{ "status": "unavailable" }` when it does not. ' +
        "No authentication required.",
      operationId: "getReadiness",
      security: [],
      responses: {
        200: jsonResponse(
          "The database is reachable and the service is ready to serve traffic.",
          { $ref: "#/components/schemas/ReadinessReadyResponse" },
          { status: "ready" },
        ),
        503: jsonResponse(
          "The database is unreachable and the service is not ready.",
          { $ref: "#/components/schemas/ReadinessUnavailableResponse" },
          { status: "unavailable", message: "Service is not ready yet." },
        ),
      },
    },
  },
};

export default healthPaths;
