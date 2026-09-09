import { afterAll, beforeEach } from "vitest";

import { loadEnv, resetEnv } from "../../src/config/env.js";
import { resetMetrics } from "../../src/metrics/registry.js";
import { setSilent } from "../../src/utils/logger.js";
import { integrationDatabaseUrl, integrationRedisUrl } from "./config.js";

// ---------------------------------------------------------------------------
// Environment. These MUST be set before any src/ module is evaluated, because
// module-level singletons resolve connection strings at import time (e.g.
// `new PrismaClient()` reads DATABASE_URL from the process environment). The
// src modules used below are therefore imported DYNAMICALLY after this block,
// and Vitest evaluates test files (and their static imports) only after this
// setup file has finished running.
// ---------------------------------------------------------------------------

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = integrationDatabaseUrl;
process.env.REDIS_URL = integrationRedisUrl;
process.env.CORS_ORIGIN = "http://localhost:3000";
process.env.JWT_SECRET = "integration-test-secret-that-is-long-enough-for-tests";
process.env.JWT_EXPIRES_IN = "1h";
process.env.REFRESH_TOKEN_TTL_DAYS = "30";

// High budgets so the suite never trips rate limits while still exercising the
// REAL Redis-backed stores (each test starts from an empty keyspace anyway).
process.env.RATE_LIMIT_WINDOW_MS = "60000";
process.env.RATE_LIMIT_MAX = "10000";
process.env.AUTH_RATE_LIMIT_MAX = "10000";
process.env.AUTH_EMAIL_RATE_LIMIT_MAX = "10000";

// Auth emails are logged, never sent over SMTP, during tests.
process.env.EMAIL_ENABLED = "false";

const INFRA_SETUP_HINT =
  "\nIntegration tests need PostgreSQL + Redis. Start them with EITHER:\n\n" +
  "    # Docker (works everywhere Docker can run):\n" +
  "    docker compose -f backend/docker-compose.yml up -d --wait\n\n" +
  "    # Local, Docker-free fallback (Windows/Linux/macOS without admin):\n" +
  "    npm run test:infra:up        # scripted Postgres init/start + portable Redis\n" +
  "    npm run test:infra:down      # stop when done\n\n" +
  "then re-run the suite. Override the connection strings via\n" +
  "INTEGRATION_DATABASE_URL / INTEGRATION_REDIS_URL if your services live elsewhere.";

async function bootstrap(): Promise<void> {
  resetEnv();
  resetMetrics();
  setSilent(true);
  // Cache the parsed environment so src/ singletons (e.g. auth's
  // refreshTokenExpiry) can call getEnv() during tests.
  loadEnv();

  // 1. Verify PostgreSQL is reachable, with a helpful hint when it is not.
  const { connectDatabase } = await import("../../src/db/prisma.js");
  try {
    await connectDatabase();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Could not connect to the integration PostgreSQL (${integrationDatabaseUrl}).\n${message}${INFRA_SETUP_HINT}`,
    );
  }

  // 2. Verify Redis is reachable and connect the app's shared Redis singleton.
  const { connectRedis } = await import("../../src/redis/redisClient.js");
  const redisConnected = await connectRedis();
  if (!redisConnected) {
    throw new Error(
      `Could not connect to the integration Redis (${integrationRedisUrl}).${INFRA_SETUP_HINT}`,
    );
  }

  // 3. Apply pending Prisma migrations deterministically (no-op when the
  //    schema is already up to date). Always targets the integration database.
  const { isSchemaUpToDate, applyPendingMigrations } = await import("./helpers/database.js");
  if (!(await isSchemaUpToDate())) {
    applyPendingMigrations();
  }

  // 4. Start from a pristine schema and an empty Redis keyspace, even when a
  //    previous run was interrupted mid-test.
  const { cleanupTestDatabase } = await import("./helpers/database.js");
  const { clearTestRedis } = await import("./helpers/redis.js");
  await cleanupTestDatabase();
  await clearTestRedis();
}

// Top-level await: no test may start until PostgreSQL and Redis are verified,
// migrations are applied, and both stores are clean.
await bootstrap();

// Every test starts from a pristine, migrated database and an empty Redis
// keyspace, with environment/metrics/loggers reset — matching the isolation
// guarantees of the unit suite while operating on real infrastructure.
beforeEach(async () => {
  resetEnv();
  resetMetrics();
  setSilent(true);
  loadEnv();

  const { cleanupTestDatabase } = await import("./helpers/database.js");
  const { clearTestRedis } = await import("./helpers/redis.js");
  await cleanupTestDatabase();
  await clearTestRedis();
});

// Close the shared connections when the whole integration run finishes. Each
// test file still gets its own client instances inside its isolate.
afterAll(async () => {
  const { disconnectDatabase } = await import("../../src/db/prisma.js");
  const { disconnectRedis } = await import("../../src/redis/redisClient.js");
  await Promise.allSettled([disconnectDatabase(), disconnectRedis()]);
});