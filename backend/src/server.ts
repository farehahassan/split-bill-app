import { loadEnv } from "./config/env.js";
import { createApp } from "./app.js";
import { logger } from "./utils/logger.js";

function start(): void {
  const env = loadEnv();
  const app = createApp();

  app.listen(env.PORT, () => {
    logger.info(`Hisab backend running on port ${env.PORT} [${env.NODE_ENV}]`);
  });
}

start();
