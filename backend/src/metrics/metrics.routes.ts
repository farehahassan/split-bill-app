import { Router } from "express";

import { metrics } from "./registry.js";

const router = Router();

/**
 * Exposes the in-process metrics in Prometheus text format (0.0.4). The payload
 * contains only aggregate counters and histograms with bounded labels - no
 * request IDs, user data, credentials, or raw paths - and rendering is a cheap
 * in-memory serialization with no database or Redis access.
 *
 * Enable/disable this route with `METRICS_ENABLED`. For production, restrict
 * access at the edge/gateway layer or set `METRICS_ENABLED=false`; the README
 * documents the trade-off.
 */
router.get("/", (_req, res) => {
  res.set("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
  res.send(metrics.renderPrometheus());
});

export default router;
