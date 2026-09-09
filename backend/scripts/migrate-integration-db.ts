// Applies Prisma migrations to the ISOLATED integration-test database.
//
// Usage:
//   tsx scripts/migrate-integration-db.ts            # `prisma migrate deploy`
//   tsx scripts/migrate-integration-db.ts --reset    # drop + re-apply all migrations
//
// This mirrors `prisma migrate deploy`/`migrate reset` but always targets the
// integration database (INTEGRATION_DATABASE_URL, defaulting to the
// docker-compose.yml service on port 5433). It never touches DATABASE_URL, so a
// developer's dev database is never at risk.
//
// `migrate deploy` is idempotent: it only creates migrations that have not been
// applied yet. The integration test setup calls this when the schema is
// missing/out of date, and CI can call it explicitly via `npm run db:migrate:test`.

import { spawnSync } from "node:child_process";

const INTEGRATION_DATABASE_URL_DEFAULT =
  "postgresql://splitease:splitease_test@localhost:5433/splitease_integration";

const integrationDatabaseUrl =
  process.env.INTEGRATION_DATABASE_URL ?? INTEGRATION_DATABASE_URL_DEFAULT;

const reset = process.argv.includes("--reset");

const commandArgs = reset
  ? ["prisma", "migrate", "reset", "--force", "--skip-seed"]
  : ["prisma", "migrate", "deploy"];

// `npx` resolves the project-local prisma CLI even when npm is not the active
// package manager; the `--no-install` flag guarantees we never fetch it. The
// `.cmd` suffix keeps spawnSync working without a shell on Windows.
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

const result = spawnSync(npx, ["--no-install", ...commandArgs], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: {
    ...process.env,
    // Point prisma at the integration database, regardless of any DATABASE_URL
    // that happens to be set in the environment or a local .env file.
    DATABASE_URL: integrationDatabaseUrl,
    PRISMA_HIDE_UPDATE_MESSAGE: "1",
  },
});

if (result.status === null) {
  throw new Error(
    `Prisma ${reset ? "reset" : "deploy"} could not be executed: ` +
      `check that the integration PostgreSQL service is running (` +
      `"docker compose -f docker-compose.yml up -d --wait").`,
  );
}

process.exitCode = result.status;