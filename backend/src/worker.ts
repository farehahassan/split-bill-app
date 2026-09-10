import { loadEnv } from "./config/env.js";
import { connectDatabase, disconnectDatabase } from "./db/prisma.js";
import { getJobQueue } from "./queues/jobQueue.js";
import { WorkerRunner } from "./queues/workerRunner.js";
import { connectRedis, disconnectRedis } from "./redis/redisClient.js";
import { startMetricsServer, stopMetricsServer } from "./metrics/metricsEndpoint.js";
import { logger } from "./utils/logger.js";

let runner: WorkerRunner | null = null;

async function start(): Promise<void> {
  const env = loadEnv();

  await connectDatabase();
  logger.info("Connected to the database", { nodeEnv: env.NODE_ENV });

  // Unlike the API server, the worker cannot degrade: a job queue without
  // Redis either silently loses jobs or never delivers them. Fail hard.
  const redisConnected = await connectRedis();
  if (!redisConnected) {
    throw new Error("Redis is unavailable; the background worker cannot start without it.");
  }

  runner = new WorkerRunner({
    queue: getJobQueue(),
    pollIntervalMs: env.JOB_QUEUE_POLL_INTERVAL_MS,
  });

  if (env.METRICS_ENABLED === "true" && env.METRICS_PORT) {
    startMetricsServer(env.METRICS_PORT);
    logger.info("Metrics endpoint listening", { port: env.METRICS_PORT });
  }

  registerShutdownHandlers();

  // Runs forever; only returns once `stop()` is called by a signal handler.
  await runner.start();
}

function registerShutdownHandlers(): void {
  const shutdown = (signal: string): void => {
    logger.info(`Received ${signal}, shutting down gracefully`);
    void (async () => {
      if (runner) await runner.stop();
      await stopMetricsServer();
      await disconnectDatabase();
      await disconnectRedis();
      process.exit(0);
    })();
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

process.on("unhandledRejection", (reason: unknown) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  logger.error("Unhandled promise rejection in worker; exiting", { error: message });
  process.exit(1);
});

process.on("uncaughtException", (error: Error) => {
  logger.error("Uncaught exception in worker; exiting", { error: error.message });
  process.exit(1);
});

start().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  logger.error("Failed to start the background worker", { error: message });
  process.exit(1);
});
