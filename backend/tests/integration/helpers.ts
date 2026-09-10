import { Redis } from "ioredis";

/**
 * Shared environment plumbing for the real-infrastructure integration suites.
 *
 * The suites are ordinary Vitest files, but instead of faking PostgreSQL and
 * Redis they connect to real services. An explicit opt-in gate keeps `npm test`
 * fully hermetic while still letting CI genuinely exercise real infrastructure:
 * a suite skips only when it is not configured, and it never fakes a pass.
 */
const OPT_IN = process.env.RUN_INTEGRATION_TESTS === "true";
const HAS_TEST_DATABASE_URL =
  typeof process.env.TEST_DATABASE_URL === "string" && process.env.TEST_DATABASE_URL.length > 0;

/**
 * True only when the operator explicitly set `RUN_INTEGRATION_TESTS=true` AND
 * supplied a dedicated `TEST_DATABASE_URL`. Used with Vitest's `describe.skipIf`
 * so an unconfigured run is skipped loudly, never silently green.
 */
export const canRunIntegrationTests = OPT_IN && HAS_TEST_DATABASE_URL;

/** The dedicated test database. Never points at development or production data. */
export const TEST_DATABASE_URL: string | undefined = process.env.TEST_DATABASE_URL;

/**
 * Redis test target, pinned to a dedicated logical database (index 15 by
 * default) so running the suite can never touch development or production
 * keyspace even when the same server instance is reused.
 */
export const TEST_REDIS_URL: string = process.env.TEST_REDIS_URL ?? "redis://localhost:6379/15";

/**
 * Opens an ioredis connection to the dedicated test database. The suite is
 * responsible for calling `quit()` in `afterAll`.
 */
export function openTestRedis(): Redis {
  return new Redis(TEST_REDIS_URL, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 5_000,
    retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 1_000)),
  });
}

/**
 * Every table in the schema, used to reset the database deterministically
 * between tests. Order is irrelevant because the reset runs a single TRUNCATE
 * ... CASCADE.
 */
export const ALL_TABLES = [
  "User",
  "Group",
  "GroupMember",
  "Expense",
  "ExpenseSplit",
  "Settlement",
  "ActivityEvent",
  "RefreshToken",
  "IdempotencyRecord",
  "GroupSummary",
] as const;
