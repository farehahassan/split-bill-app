import { createServer, type Server } from "node:http";

import { logger } from "../utils/logger.js";
import { metrics } from "./registry.js";

let server: Server | null = null;

/**
 * Starts a minimal HTTP server that serves the same Prometheus text-format
 * metrics as the API's `/metrics` route. Used by the background worker, which
 * has no Express server of its own: job and Redis metrics live in the worker's
 * in-process registry, and `METRICS_PORT` gives operators a scrape target for
 * that process.
 *
 * The worker relies on Redis and is already long-running, so this lightweight
 * listener is the smallest way to make its metrics observable. Only the
 * process-local registry is exposed - no application data.
 */
export function startMetricsServer(port: number): Server {
  server = createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain; version=0.0.4; charset=utf-8" });
    res.end(metrics.renderPrometheus());
  });

  server.on("error", (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Metrics endpoint failed", { error: message });
  });

  server.listen(port);
  return server;
}

export function getMetricsServer(): Server | null {
  return server;
}

export async function stopMetricsServer(): Promise<void> {
  const current = server;
  server = null;
  if (!current) return;

  await new Promise<void>((resolve) => {
    current.close(() => resolve());
  });
}
