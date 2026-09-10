import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z
  .object({
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
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== "production") return;

    if (env.JWT_SECRET.length < 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["JWT_SECRET"],
        message: "JWT_SECRET must be at least 32 characters in production",
      });
    }

    if (env.CORS_ORIGIN === "http://localhost:3000") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["CORS_ORIGIN"],
        message: "CORS_ORIGIN must be explicitly set to the allowed frontend origin in production",
      });
    }
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

  _env = parsed.data;
  return _env;
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
