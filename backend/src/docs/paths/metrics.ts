import type { PathItemObject } from "../openapi.types.js";

export const METRICS_TAG = "Metrics";

/**
 * `GET /metrics` returns the Prometheus text exposition format. It is only
 * mounted when `METRICS_ENABLED=true` (the default), so it is documented as an
 * opt-out infrastructure endpoint. The payload contains no user data.
 */
const metricsPaths: Record<string, PathItemObject> = {
  "/metrics": {
    get: {
      tags: [METRICS_TAG],
      summary: "Prometheus metrics",
      description:
        "Exposes aggregate application metrics in the Prometheus text exposition format (0.0.4). " +
        "The payload contains only aggregate counters and histograms with bounded labels - no user data, request ids, paths, or credentials - " +
        "and is rendered in memory without database or Redis access. " +
        "Enabled when `METRICS_ENABLED=true` (the default); disable with `METRICS_ENABLED=false`. No authentication.",
      operationId: "getMetrics",
      security: [],
      responses: {
        200: {
          description: "The metrics payload in Prometheus text exposition format.",
          content: {
            "text/plain": {
              schema: {
                type: "string",
                description: "Prometheus text exposition format 0.0.4.",
              },
            },
          },
        },
      },
    },
  },
};

export default metricsPaths;
