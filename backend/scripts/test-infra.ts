#!/usr/bin/env node
// Deterministic lifecycle for the local (non-Docker) integration-test
// infrastructure: an ISOLATED PostgreSQL instance on port 5433 and an ISOLATED
// Redis on port 6380, both bound to 127.0.0.1. It is a drop-in replacement for
// `docker compose` on machines that have neither Docker nor administrative
// rights. The normal development database (PostgreSQL on 5432) is never
// touched: this script only ever operates on its own data directory and port.
//
// Usage:
//   npx tsx scripts/test-infra.ts up      # create + start + migrate-ready both services
//   npx tsx scripts/test-infra.ts down    # stop the instances started by `up`
//   npx tsx scripts/test-infra.ts status  # report resilience and endpoints
//
// Behaviour:
//   - idempotent: already-running services are detected and reused
//   - deterministic: the PG data directory is initialized with initdb when
//     missing; the test database is created when absent
//   - Windows-aware: PostgreSQL for Windows frequently fails to spawn backends
//     with "could not reserve shared memory region ... error code 487" (ASLR)
//     at the default 128MB shared_buffers, so the server is started with a
//     smaller shared_buffers/max_connections to shrink the shared segment
//   - self-sufficient for Redis: a pinned, sha256-verified portable Windows
//     Redis is downloaded once into TEST_INFRA_DIR when no redis-server is
//     available on PATH (or REDIS_SERVER_BIN)
//   - fails loudly with the tail of the server log instead of hanging

import {
  createHash,
} from "node:crypto";
import {
  closeSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { connect } from "node:net";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = resolve(SCRIPT_DIR, "..");

const INTEGRATION_DATABASE_URL =
  process.env.INTEGRATION_DATABASE_URL ??
  "postgresql://splitease:splitease_test@localhost:5433/splitease_integration";
const INTEGRATION_REDIS_URL =
  process.env.INTEGRATION_REDIS_URL ?? "redis://localhost:6380/15";
const TEST_INFRA_DIR = process.env.TEST_INFRA_DIR ?? resolve(BACKEND_ROOT, ".test-infra");

const PG_DATA_DIR = join(TEST_INFRA_DIR, "pgdata");
const PG_LOG_FILE = join(TEST_INFRA_DIR, "pg.log");
const PG_PW_FILE = join(TEST_INFRA_DIR, "pgpass.txt");
const REDIS_DIR = join(TEST_INFRA_DIR, "redis");
const REDIS_LOG_FILE = join(TEST_INFRA_DIR, "redis.log");
const REDIS_PID_FILE = join(TEST_INFRA_DIR, "redis.pid");

// Pinned portable Windows Redis (the same upstream build the community
// `redis-64`/Memurai packages wrap). Kept in the repo's ignored infra dir so
// `up` needs no network after the first run.
const REDIS_VERSION = "5.0.14.1";
const REDIS_ZIP_FILENAME = `Redis-x64-${REDIS_VERSION}.zip`;
const REDIS_ZIP_URL =
  `https://github.com/tporadowski/redis/releases/download/v${REDIS_VERSION}/${REDIS_ZIP_FILENAME}`;
const REDIS_ZIP_SHA256 = "018EA18A35876383CBB5F4CD0258ADFC87747CF9D619BCE1CF73A2E36F720CCF";

const isWindows = process.platform === "win32";

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

function log(message: string): void {
  console.log(`[test-infra] ${message}`);
}

function fail(message: string): never {
  console.error(`[test-infra] ERROR: ${message}`);
  process.exit(1);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

// Cap any single subprocess so a wedged Postgres/Redis step fails loudly with
// a log tail instead of leaving the script hanging forever.
const RUN_TIMEOUT_MS = 60_000;

function run(
  command: string,
  args: string[],
  extraEnv: Record<string, string> = {},
  stdio: "pipe" | "ignore" = "pipe",
): RunResult {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    // Commands that daemonize (pg_ctl start) MUST NOT inherit our stdout/stderr
    // pipes: the long-lived child (the postmaster) keeps the pipe handle open,
    // so spawnSync never sees EOF and hangs until the timeout. Detach them and
    // rely on the PostgreSQL log file + readiness poll instead.
    stdio: stdio === "ignore" ? "ignore" : ["ignore", "pipe", "pipe"],
    windowsHide: true,
    timeout: RUN_TIMEOUT_MS,
    killSignal: "SIGTERM",
    env: { ...process.env, ...extraEnv },
  });
  if (result.error) {
    const detail = result.error instanceof Error ? result.error.message : String(result.error);
    fail(
      `Command failed to run: ${command} ${args.join(" ")}\n` +
        `${detail}\n` +
        `${(result.stderr ?? "") + (result.stdout ?? "")}`.trim(),
    );
  }
  if (result.status === null) {
    fail(
      `Command timed out after ${RUN_TIMEOUT_MS}ms: ${command} ${args.join(" ")}`,
    );
  }
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function tailOf(file: string, lines = 30): string {
  if (!existsSync(file)) return `(log file does not exist: ${file})`;
  const content = readFileSync(file, "utf8");
  const trimmed = content.split(/\r?\n/).filter(Boolean);
  return trimmed.slice(-lines).join("\n");
}

interface PostgresUrl {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

function parsePostgresUrl(url: string): PostgresUrl {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port) || 5432,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, ""),
  };
}

interface RedisUrl {
  host: string;
  port: number;
  database: number;
}

function parseRedisUrl(url: string): RedisUrl {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port) || 6379,
    database: parsed.pathname.replace(/^\//, "") === ""
      ? 0
      : Number(parsed.pathname.replace(/^\//, "")) || 0,
  };
}

// ---------------------------------------------------------------------------
// PostgreSQL binaries
// ---------------------------------------------------------------------------

function findOnPath(binary: string): string | null {
  const result = run(isWindows ? "where" : "which", [binary]);
  if (result.status === 0 && result.stdout.trim()) {
    return result.stdout.trim().split(/\r?\n/)[0] ?? null;
  }
  return null;
}

function tryBinary(name: string, dir: string): string | null {
  const candidate = join(dir, isWindows ? `${name}.exe` : name);
  return existsSync(candidate) ? candidate : null;
}

function resolvePostgresBinary(name: string): string {
  const explicit = process.env.POSTGRES_BIN_DIR;
  if (explicit) {
    const candidate = tryBinary(name, explicit);
    if (candidate) return candidate;
  }

  const onPath = findOnPath(name);
  if (onPath) return onPath;

  // Common Windows install layout: C:\Program Files\PostgreSQL\<version>\bin.
  if (isWindows) {
    const programFiles = process.env.ProgramFiles ?? "C:\\Program Files";
    const pgRoot = join(programFiles, "PostgreSQL");
    if (existsSync(pgRoot)) {
      const versions = readdirSync(pgRoot)
        .map((entry) => Number(entry))
        .filter((value) => Number.isInteger(value))
        .sort((a, b) => b - a);
      for (const version of versions) {
        const candidate = tryBinary(name, join(pgRoot, String(version), "bin"));
        if (candidate) return candidate;
      }
    }
  }

  fail(
    `Could not find the PostgreSQL tool "${name}". ` +
      `Install PostgreSQL or set POSTGRES_BIN_DIR to its bin/ directory.`,
  );
}

// ---------------------------------------------------------------------------
// Redis availability (TCP PING/PONG probe)
// ---------------------------------------------------------------------------

function redisReady(host: string, port: number, timeoutMs = 1500): Promise<boolean> {
  return new Promise((resolveReady) => {
    const socket = connect({ host, port, timeout: timeoutMs });
    let settled = false;
    const done = (ready: boolean): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolveReady(ready);
    };
    socket.setTimeout(timeoutMs);
    socket.on("connect", () => socket.write("PING\r\n"));
    socket.on("data", (chunk) => {
      const reply = chunk.toString().trim().toUpperCase();
      done(reply.startsWith("+PONG"));
    });
    socket.on("timeout", () => done(false));
    socket.on("error", () => done(false));
  });
}

// ---------------------------------------------------------------------------
// PostgreSQL lifecycle
// ---------------------------------------------------------------------------

function pgIsReady(host: string, port: number): boolean {
  const pgIsReadyBin = resolvePostgresBinary("pg_isready");
  const result = run(pgIsReadyBin, ["-h", host, "-p", String(port)]);
  return result.status === 0;
}

function initializeDataDirectory(user: string, password: string): void {
  const initdb = resolvePostgresBinary("initdb");
  writeFileSync(PG_PW_FILE, password, "utf8");
  const result = run(
    initdb,
    ["-D", PG_DATA_DIR, "-U", user, "-A", "scram-sha-256", `--pwfile=${PG_PW_FILE}`],
  );
  try {
    unlinkSync(PG_PW_FILE);
  } catch {
    // best-effort cleanup of the temporary password file
  }
  if (result.status !== 0) {
    const detail = (result.stderr + result.stdout).trim();
    fail(
      `initdb failed for the isolated integration PostgreSQL.\n${detail}\n` +
        `Data directory: ${PG_DATA_DIR}`,
    );
  }
  log(`initialized PostgreSQL data directory: ${PG_DATA_DIR}`);
}

async function startPostgres(pg: PostgresUrl): Promise<void> {
  const pgCtl = resolvePostgresBinary("pg_ctl");

  if (pgIsReady(pg.host, pg.port)) {
    log(`PostgreSQL already running on ${pg.host}:${pg.port} - reusing it.`);
    return;
  }
  if (existsSync(PG_DATA_DIR)) {
    log(`PostgreSQL on ${pg.host}:${pg.port} is not answering; (re)starting from ${PG_DATA_DIR}.`);
    // A crashed/leftover postmaster can hold the port while every backend fails
    // (see the shared_memory_type note below). Give pg_ctl a chance to clean up.
    run(pgCtl, ["-D", PG_DATA_DIR, "stop", "-m", "fast"]);
  } else {
    initializeDataDirectory(pg.user, pg.password);
  }

  // Windows flaw: PG 13+ for Windows frequently fails to spawn backends with
  // "could not reserve shared memory region (addr=...) error code 487" (ASLR)
  // when shared_buffers is high - the fixed-address mapping collides with a
  // freshly loaded DLL in the child. Lowering shared_buffers shrinks the mapped
  // region so the collision goes away, which is verified to start reliably on
  // Windows 11 with PG 18 (a plain 128MB default fails every time). The test
  // workload is tiny, so a 16MB cache is plentiful.
  const serverOptions = [
    `-p ${pg.port}`,
    "-c listen_addresses=127.0.0.1",
    "-c shared_buffers=16MB",
    "-c max_connections=20",
  ].join(" ");

  const result = run(
    pgCtl,
    ["-D", PG_DATA_DIR, "-l", PG_LOG_FILE, "-o", serverOptions, "start"],
    {},
    "ignore",
  );
  if (result.status !== 0) {
    fail(
      `pg_ctl failed to start the integration PostgreSQL.\n` +
        `${(result.stderr + result.stdout).trim()}\n` +
        `--- last lines of ${PG_LOG_FILE} ---\n${tailOf(PG_LOG_FILE)}`,
    );
  }
  log(`starting PostgreSQL on ${pg.host}:${pg.port} from ${PG_DATA_DIR}`);

  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (pgIsReady(pg.host, pg.port)) break;
    await sleep(500);
    if (attempt === 59) {
      fail(
        `Timed out waiting for PostgreSQL on ${pg.host}:${pg.port} to become ready.\n` +
          `--- last lines of ${PG_LOG_FILE} ---\n${tailOf(PG_LOG_FILE)}`,
      );
    }
  }
  log(`PostgreSQL is ready on ${pg.host}:${pg.port}.`);
}

function ensureDatabase(pg: PostgresUrl): void {
  const psql = resolvePostgresBinary("psql");
  log(`checking whether database "${pg.database}" exists`);
  const env = {
    PGPASSWORD: pg.password,
    PGSSLMODE: "disable",
  };

  const exists = run(
    psql,
    [
      "-h", pg.host, "-p", String(pg.port), "-U", pg.user, "-d", "postgres",
      "-tAc", `SELECT 1 FROM pg_database WHERE datname = '${pg.database}'`,
    ],
    env,
  );
  if (exists.status === 0 && exists.stdout.trim() === "1") {
    log(`integration database "${pg.database}" already exists.`);
    return;
  }
  if (exists.status !== 0) {
    fail(
      `Could not query the integration PostgreSQL catalog.\n` +
        `${(exists.stderr + exists.stdout).trim()}\n` +
        `--- last lines of ${PG_LOG_FILE} ---\n${tailOf(PG_LOG_FILE)}`,
    );
  }

  const createdb = resolvePostgresBinary("createdb");
  const created = run(
    createdb,
    ["-h", pg.host, "-p", String(pg.port), "-U", pg.user, pg.database],
    env,
  );
  if (created.status !== 0) {
    fail(
      `Could not create the integration database "${pg.database}".\n` +
        `${(created.stderr + created.stdout).trim()}`,
    );
  }
  log(`created integration database "${pg.database}".`);
}

function stopPostgres(pg: PostgresUrl): void {
  const pgCtl = resolvePostgresBinary("pg_ctl");
  if (!pgIsReady(pg.host, pg.port)) {
    log(`PostgreSQL on ${pg.host}:${pg.port} is not running - nothing to stop.`);
    return;
  }
  if (!existsSync(PG_DATA_DIR)) {
    log(`No managed data directory at ${PG_DATA_DIR}; leaving the running PostgreSQL alone.`);
    return;
  }
  const result = run(pgCtl, ["-D", PG_DATA_DIR, "stop", "-m", "fast"]);
  if (result.status !== 0) {
    fail(`pg_ctl stop failed.\n${(result.stderr + result.stdout).trim()}`);
  }
  log("PostgreSQL stopped.");
}

// ---------------------------------------------------------------------------
// Redis lifecycle
// ---------------------------------------------------------------------------

async function downloadPortableRedis(): Promise<string> {
  if (!isWindows) {
    fail(
      "No redis-server found. Install Redis (e.g. `apt install redis-server`) or set REDIS_SERVER_BIN.",
    );
  }

  const zipPath = join(REDIS_DIR, REDIS_ZIP_FILENAME);
  mkdirSync(REDIS_DIR, { recursive: true });

  if (existsSync(zipPath) && sha256Of(zipPath).toLowerCase() === REDIS_ZIP_SHA256.toLowerCase()) {
    log(`portable Redis archive already present: ${zipPath}`);
  } else {
    log(`downloading portable Windows Redis ${REDIS_VERSION} from ${REDIS_ZIP_URL}`);
    const response = await fetch(REDIS_ZIP_URL);
    if (!response.ok || response.body === null) {
      fail(
        `Could not download Redis from ${REDIS_ZIP_URL} (HTTP ${response.status}). ` +
          `Download it manually and set REDIS_SERVER_BIN to redis-server.exe.`,
      );
    }
    await new Promise<void>((resolveWrite, rejectWrite) => {
      const stream = createWriteStream(zipPath);
      const reader = response.body!.getReader();
      const pump = (): void => {
        reader.read().then(({ done, value }) => {
          if (done) {
            stream.end();
            resolveWrite();
            return;
          }
          stream.write(value);
          void pump();
        }).catch((error: unknown) => {
          stream.destroy();
          rejectWrite(error instanceof Error ? error : new Error(String(error)));
        });
      };
      void pump();
    });
    const actual = sha256Of(zipPath).toLowerCase();
    if (actual !== REDIS_ZIP_SHA256.toLowerCase()) {
      rmSync(zipPath);
      fail(
        `Downloaded Redis archive hash mismatch (expected ${REDIS_ZIP_SHA256}, got ${actual}). ` +
          "Refusing to use it; set REDIS_SERVER_BIN to a trusted redis-server instead.",
      );
    }
    log(`verified Redis archive sha256: ${actual}`);
  }

  mkdirSync(join(REDIS_DIR, "bin"), { recursive: true });
  const extractTarget = join(REDIS_DIR, "bin");
  const serverCandidate = join(extractTarget, "redis-server.exe");
  if (!existsSync(serverCandidate)) {
    // Windows ships bsdtar in System32; it can expand zip archives.
    const tar = findOnPath("tar") ?? "tar";
    const extracted = run(tar, ["-xf", zipPath, "-C", extractTarget]);
    if (extracted.status !== 0) {
      fail(`Could not extract the Redis archive.\n${(extracted.stderr + extracted.stdout).trim()}`);
    }
    log(`extracted portable Redis to ${extractTarget}`);
  }
  return serverCandidate;
}

function sha256Of(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

async function resolveRedisServer(): Promise<string> {
  const explicit = process.env.REDIS_SERVER_BIN;
  if (explicit) {
    if (!existsSync(explicit)) {
      fail(`REDIS_SERVER_BIN points to a missing file: ${explicit}`);
    }
    return explicit;
  }
  const onPath = findOnPath("redis-server");
  if (onPath) return onPath;
  return downloadPortableRedis();
}

function redisPidOf(): number | null {
  try {
    return Number(readFileSync(REDIS_PID_FILE, "utf8").trim());
  } catch {
    return null;
  }
}

async function startRedis(redis: RedisUrl): Promise<void> {
  if (await redisReady(redis.host, redis.port)) {
    log(`Redis already running on ${redis.host}:${redis.port} - reusing it.`);
    return;
  }

  const server = await resolveRedisServer();
  const args = [
    "--bind", "127.0.0.1",
    "--port", String(redis.port),
    "--save", "",
    "--appendonly", "no",
  ];

  mkdirSync(TEST_INFRA_DIR, { recursive: true });
  const logFd = openSync(REDIS_LOG_FILE, "a");
  log(`starting Redis: ${server} ${args.join(" ")}`);
  const child = spawn(server, args, {
    detached: true,
    stdio: ["ignore", logFd, logFd],
    windowsHide: true,
  });
  try {
    closeSync(logFd);
  } catch {
    // already closed via the child
  }
  const pid = child.pid ?? -1;
  if (pid > 0) {
    writeFileSync(REDIS_PID_FILE, String(pid), "utf8");
  }
  child.unref();

  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await redisReady(redis.host, redis.port)) break;
    await sleep(200);
    if (attempt === 39) {
      fail(
        `Timed out waiting for Redis on ${redis.host}:${redis.port} to become ready.\n` +
          `--- last lines of ${REDIS_LOG_FILE} ---\n${tailOf(REDIS_LOG_FILE)}`,
      );
    }
  }
  log(`Redis is ready on ${redis.host}:${redis.port} (pid ${pid}).`);
}

function isProcessAlive(pid: number): boolean {
  if (isWindows) {
    const result = run("tasklist", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"]);
    return result.status === 0 && result.stdout.includes(`"${pid}"`);
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function stopRedis(redis: RedisUrl): void {
  const pid = redisPidOf();
  if (pid === null || !isProcessAlive(pid)) {
    log(`Redis on ${redis.host}:${redis.port} is not managed by this tool - leaving it alone.`);
    return;
  }

  // Only terminate a process we started and recorded; never a user's instance.
  if (isWindows) {
    const killed = run("taskkill", ["/PID", String(pid), "/T", "/F"]);
    if (killed.status !== 0) {
      fail(`Could not stop the managed Redis (pid ${pid}).\n${(killed.stderr + killed.stdout).trim()}`);
    }
  } else {
    try {
      process.kill(pid, "SIGTERM");
    } catch (error) {
      fail(`Could not stop the managed Redis (pid ${pid}): ${String(error)}`);
    }
  }
  try {
    unlinkSync(REDIS_PID_FILE);
  } catch {
    // nothing to remove
  }
  log("Redis stopped.");
}

async function status(): Promise<void> {
  const pg = parsePostgresUrl(INTEGRATION_DATABASE_URL);
  const redis = parseRedisUrl(INTEGRATION_REDIS_URL);
  const pgUp = pgIsReady(pg.host, pg.port);
  const redisUp = await redisReady(redis.host, redis.port);

  console.log("[test-infra] status");
  console.log(`  infra dir     : ${TEST_INFRA_DIR}`);
  console.log(`  database url  : ${INTEGRATION_DATABASE_URL}`);
  console.log(`  postgres      : ${pgUp ? "UP" : "DOWN"} (${pg.host}:${pg.port})`);
  console.log(`  redis url     : ${INTEGRATION_REDIS_URL}`);
  console.log(`  redis         : ${redisUp ? "UP" : "DOWN"} (${redis.host}:${redis.port})`);

  if (!pgUp || !redisUp) {
    console.log(
      "  -> run `npx tsx scripts/test-infra.ts up` to start the missing service(s).",
    );
  }
}

async function up(): Promise<void> {
  log(`integration root: ${TEST_INFRA_DIR}`);
  mkdirSync(TEST_INFRA_DIR, { recursive: true });

  const pg = parsePostgresUrl(INTEGRATION_DATABASE_URL);
  const redis = parseRedisUrl(INTEGRATION_REDIS_URL);

  // 1. PostgreSQL: start, then make sure the test database exists.
  startPostgres(pg);
  ensureDatabase(pg);

  // 2. Redis: start when needed.
  await startRedis(redis);

  log("Integration infrastructure is up and ready.");
  console.log(`  database:  ${INTEGRATION_DATABASE_URL}`);
  console.log(`  redis:     ${INTEGRATION_REDIS_URL}`);
  console.log(
    "  Next:      npm run test:integration",
  );
}

async function down(): Promise<void> {
  const pg = parsePostgresUrl(INTEGRATION_DATABASE_URL);
  const redis = parseRedisUrl(INTEGRATION_REDIS_URL);
  stopRedis(redis);
  stopPostgres(pg);
  log("Integration infrastructure stopped.");
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? "help";
  switch (command) {
    case "up":
      await up();
      break;
    case "down":
      await down();
      break;
    case "status":
      await status();
      break;
    default:
      console.log(
        "Usage: npx tsx scripts/test-infra.ts <up|down|status>",
      );
      process.exitCode = 1; // eslint wants a return; exitCode is fine
  }
}

void main();