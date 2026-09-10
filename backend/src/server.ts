import type { Server } from "node:http";

import { loadEnv } from "./config/env.js";
import { createApp } from "./app.js";
import { connectDatabase, disconnectDatabase } from "./db/prisma.js";
import { connectRedis, disconnectRedis } from "./redis/redisClient.js";
import { logger } from "./utils/logger.js";

let server: Server | null = null;

async function start(): Promise<void> {
  const env = loadEnv();

  await connectDatabase();
  logger.info("Connected to the database", { nodeEnv: env.NODE_ENV });

  // Non-fatal: on failure Redis-dependent features degrade (rate limiting
  // falls back to in-memory state, distributed locking is skipped) and the
  // server keeps serving.
  await connectRedis();

  const app = createApp();

  server = app.listen(env.PORT, () => {
    logger.info(`Hisab backend running on port ${env.PORT} [${env.NODE_ENV}]`);
  });

  registerShutdownHandlers();
}

function registerShutdownHandlers(): void {
  const shutdown = (signal: string): void => {
    logger.info(`Received ${signal}, shutting down gracefully`);
    server?.close(async () => {
      await disconnectDatabase();
      await disconnectRedis();
      process.exit(0);
    });
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

process.on("unhandledRejection", (reason: unknown) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  logger.error("Unhandled promise rejection; exiting", { error: message });
  process.exit(1);
});

process.on("uncaughtException", (error: Error) => {
  logger.error("Uncaught exception; exiting", { error: error.message });
  process.exit(1);
});

start().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  logger.error("Failed to start the server", { error: message });
  process.exit(1);
});
