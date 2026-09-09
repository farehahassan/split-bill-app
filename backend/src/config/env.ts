import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  JWT_SECRET: z.string().min(1, "JWT_SECRET is required"),
  JWT_EXPIRES_IN: z.string().default("7d"),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
  AUTH_EMAIL_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(5),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  TRUST_PROXY: z.string().default("false"),
  DISTRIBUTED_LOCK_TTL_MS: z.coerce.number().int().positive().default(10000),
  JOB_QUEUE_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  JOB_QUEUE_BASE_BACKOFF_MS: z.coerce.number().int().positive().default(2000),
  JOB_QUEUE_MAX_BACKOFF_MS: z.coerce.number().int().positive().default(60000),
  JOB_QUEUE_LEASE_MS: z.coerce.number().int().positive().default(30000),
  JOB_QUEUE_PAYLOAD_TTL_MS: z.coerce.number().int().positive().default(86400000),
  JOB_QUEUE_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(100),
  CACHE_GROUP_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  METRICS_ENABLED: z.enum(["true", "false"]).default("true"),
  METRICS_PORT: z.coerce.number().int().positive().optional(),
  // Transactional email (verification and password recovery). When EMAIL_ENABLED
  // is "false" the backend never connects to an SMTP server: auth emails are
  // logged instead, which is the local-development/testing behavior.
  EMAIL_ENABLED: z.enum(["true", "false"]).default("false"),
  EMAIL_HOST: z.string().default("localhost"),
  EMAIL_PORT: z.coerce.number().int().positive().default(587),
  EMAIL_SECURE: z.enum(["true", "false"]).default("true"),
  EMAIL_USERNAME: z.string().default(""),
  EMAIL_PASSWORD: z.string().default(""),
  EMAIL_FROM: z.string().default("no-reply@localhost"),
  EMAIL_FROM_NAME: z.string().default("Hisab"),
  APP_NAME: z.string().default("Hisab Split Bill"),
  APP_BASE_URL: z.string().url("APP_BASE_URL must be an absolute URL").default("http://localhost:3000"),
  EMAIL_VERIFICATION_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(1440),
  PASSWORD_RESET_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(60),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

export function loadEnv(): Env {
  if (_env) return _env;

  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const formatted = parsed.error.issues
      .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${formatted}`);
  }

  const env = parsed.data;

  assertProductionSafety(env);

  _env = env;
  return _env;
}

/**
 * Refuses to boot in production with development-shaped configuration:
 * a weak/default JWT signing secret or a CORS origin list that still contains
 * loopback origins or the localhost default. Development and test runs are
 * unaffected. Throwing at boot (instead of proceeding) makes a production
 * misconfiguration fail loudly rather than serving with known-weak settings.
 */
function assertProductionSafety(env: Env): void {
  if (env.NODE_ENV !== "production") {
    return;
  }

  const problems: string[] = [];

  if (env.JWT_SECRET.length < 32) {
    problems.push("JWT_SECRET must be at least 32 characters long in production");
  }

  const origins = env.CORS_ORIGIN.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (origins.length === 0) {
    problems.push("CORS_ORIGIN must list at least one allowed origin in production");
  }
  const loopbackOrigin = origins.some((origin) => {
    try {
      const { hostname } = new URL(origin);
      return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
    } catch {
      return true;
    }
  });
  if (loopbackOrigin) {
    problems.push(
      "CORS_ORIGIN must not contain loopback/localhost origins in production (set the real client origin)",
    );
  }

  if (problems.length > 0) {
    throw new Error(`Invalid production environment configuration:\n  ${problems.join("\n  ")}`);
  }
}

export function getEnv(): Env {
  if (!_env) {
    throw new Error("Environment not loaded. Call loadEnv() first.");
  }
  return _env;
}

export function resetEnv(): void {
  _env = null;
}
