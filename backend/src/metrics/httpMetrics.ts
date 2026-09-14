import type { NextFunction, Request, Response } from "express";

import { METRIC, METRIC_LABEL, metrics } from "./registry.js";
import { resolveRouteTemplate } from "./route.js";

/**
 * Maps a numeric HTTP status code to its bounded status class. Using the class
 * (2xx/3xx/4xx/5xx) instead of the raw code keeps the `status` label dimension
 * small and stable across environments.
 */
export function statusClass(code: number): string {
  if (code >= 200 && code < 300) return "2xx";
  if (code >= 300 && code < 400) return "3xx";
  if (code >= 400 && code < 500) return "4xx";
  if (code >= 500 && code < 600) return "5xx";
  return "other";
}

/**
 * Central HTTP instrumentation. Mounted right after the request-ID middleware so
 * it observes every routed request, and it records:
 *
 * - `http_requests_total{method,route,status}` for every completed request
 * - `http_errors_total{method,route,status}` for responses with status >= 400
 * - `http_request_duration_seconds{method,route}` (histogram) of response time
 *
 * Labels use the Express route template (e.g. `/api/v1/groups/:id`) - never raw
 * URLs, IDs, or query strings - so cardinality is bounded by the application's
 * route surface. Request IDs are intentionally not labels (they distinguish
 * individual requests, which is the job of the X-Request-Id header and logs).
 *
 * The middleware performs no I/O and never throws, so observability cannot
 * break the request it is measuring.
 */
export function requestHttpMetrics(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();

  res.on("finish", () => {
    try {
      const elapsedNs = process.hrtime.bigint() - start;
      const durationSeconds = Number(elapsedNs) / 1_000_000_000;

      const labels = {
        [METRIC_LABEL.method]: req.method,
        [METRIC_LABEL.route]: resolveRouteTemplate(req),
        [METRIC_LABEL.status]: statusClass(res.statusCode),
      };

      metrics.increment(METRIC.httpRequestsTotal, labels);
      if (res.statusCode >= 400) {
        metrics.increment(METRIC.httpErrorsTotal, labels);
      }
      metrics.observe(METRIC.httpRequestDurationSeconds, durationSeconds, {
        [METRIC_LABEL.method]: req.method,
        [METRIC_LABEL.route]: resolveRouteTemplate(req),
      });
    } catch {
      // A failure to record metrics must never affect the response that is
      // already being sent.
    }
  });

  next();
}
