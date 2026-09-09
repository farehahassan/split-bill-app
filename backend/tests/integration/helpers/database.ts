import { readdirSync } from "node:fs";
import { join } from "node:path";

import { spawnSync } from "node:child_process";
import { prisma } from "../../../src/db/prisma.js";

// Every table in prisma/schema.prisma. Since Prisma keeps table names equal to
// model names (no @@map), this is the full set that can hold authoritative
// business data. GroupSummary and the auth/token tables are included so a test
// file can assume a pristine schema regardless of what an earlier suite wrote.
const ALL_TABLES = [
  "GroupSummary",
  "IdempotencyRecord",
  "ActivityEvent",
  "ExpenseSplit",
  "Expense",
  "Settlement",
  "GroupMember",
  "Group",
  "AuthToken",
  "RefreshToken",
  "User",
] as const;

const MIGRATIONS_DIR = join(process.cwd(), "prisma", "migrations");

/**
 * Deletes every row from every table, in one statement, so tests start from a
 * clean database. TRUNCATE ... CASCADE clears child rows without needing to
 * know the exact foreign-key ordering. UUID primary keys mean there are no
 * sequences to restart.
 */
export async function cleanupTestDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${ALL_TABLES.map((table) => `"${table}"`).join(", ")} CASCADE`,
  );
}

interface AppliedMigration {
  migration_name: string;
  finished_at: Date | null;
}

/**
 * Returns true when every migration directory under prisma/migrations (at the
 * latest commit present on disk) has been applied to the integration database.
 */
export async function isSchemaUpToDate(): Promise<boolean> {
  const onDisk = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  if (onDisk.length === 0) return true;

  let applied: AppliedMigration[];
  try {
    applied = await prisma.$queryRaw<
      AppliedMigration[]
    >`SELECT "migration_name" AS migration_name, "finished_at" AS finished_at FROM "_prisma_migrations"`;
  } catch {
    // The `_prisma_migrations` table does not exist yet — nothing has been
    // applied to this (probably brand-new) database.
    return false;
  }

  const appliedByIdentifier = new Map(applied.map((row) => [row.migration_name, row]));
  return onDisk.every((name) => {
    const row = appliedByIdentifier.get(name);
    return row !== undefined && row.finished_at !== null;
  });
}

/**
 * Applies pending migrations to the integration database by delegating to
 * `scripts/migrate-integration-db.ts`. Uses the local tsx runner so the schema
 * always matches the checked-in migrations, independent of any ambient
 * DATABASE_URL in the environment.
 */
export function applyPendingMigrations(): void {
  const result = spawnSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["--no-install", "tsx", "scripts/migrate-integration-db.ts"],
    {
      stdio: "inherit",
      shell: process.platform === "win32",
      env: { ...process.env, PRISMA_HIDE_UPDATE_MESSAGE: "1" },
    },
  );
  if (result.status !== 0) {
    throw new Error(
      "Failed to apply Prisma migrations to the integration database. " +
        "Run `npm run db:migrate:test` (or the script above) to see the error.",
    );
  }
}