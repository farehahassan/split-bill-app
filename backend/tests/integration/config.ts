// Environment resolution for the integration suite. NOT part of the
// application's runtime env schema (src/config/env.ts): these variables exist
// purely to point the suite at the isolated test infrastructure defined in
// docker-compose.yml, with sane defaults so `npm run test:integration` works
// out of the box.
//
// Defaults match docker-compose.yml:
//   - PostgreSQL on host port 5433 (never the dev database on 5432)
//   - Redis on host port 6380, logical database index 15 (never dev Redis on 6379)
//
// Every value can be overridden via the environment, which is how a CI runner
// points the suite at its own ephemeral services.

const TEST_DATABASE_URL =
  process.env.INTEGRATION_DATABASE_URL ??
  "postgresql://splitease:splitease_test@localhost:5433/splitease_integration";

const TEST_REDIS_URL = process.env.INTEGRATION_REDIS_URL ?? "redis://localhost:6380/15";

/** PostgreSQL connection string for the isolated integration database. */
export const integrationDatabaseUrl = TEST_DATABASE_URL;

/** Redis connection string for the isolated integration Redis. */
export const integrationRedisUrl = TEST_REDIS_URL;