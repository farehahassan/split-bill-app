import type { Server } from "node:http";

import { loadEnv } from "./config/env.js";
import { createApp } from "./app.js";
import { connectDatabase, disconnectDatabase } from "./db/prisma.js";
import { logger } from "./utils/logger.js";

let server: Server | null = null;

async function start(): Promise<void> {
  const env = loadEnv();

  await connectDatabase();
  logger.info("Connected to the database", { nodeEnv: env.NODE_ENV });

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
      process.exit(0);
    });
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

start().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  logger.error("Failed to start the server", { error: message });
  process.exit(1);
});
