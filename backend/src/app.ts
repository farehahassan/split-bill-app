import express from "express";
import cors from "cors";
import helmet from "helmet";

import { loadEnv } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { apiLimiter, authLimiter, sensitiveEmailAuthLimiter } from "./middleware/rateLimiter.js";
import { requestId } from "./middleware/requestId.js";
import { requestCompletionLogger } from "./middleware/requestCompletionLogger.js";
import { requestHttpMetrics } from "./metrics/httpMetrics.js";
import metricsRoutes from "./metrics/metrics.routes.js";
import { configureEdge } from "./edge/index.js";
import { EDGE_MAX_BODY_BYTES } from "./edge/requestGuard.js";
import { getRedis, isRedisAvailable } from "./redis/redisClient.js";
import type { RedisLike } from "./redis/redisClient.js";
import healthRoutes from "./routes/health.js";
import apiV1Routes from "./routes/index.js";
import { docsRoutes } from "./docs/index.js";

export interface CreateAppOptions {
  /**
   * Redis client for the rate-limit stores and distributed lock. When omitted,
   * the app uses the shared singleton if it is connected, otherwise it runs
   * with process-local (in-memory) rate limiting. Tests inject a fake client to
   * exercise Redis-backed behavior without a live server.
   */
  redis?: RedisLike;
}

export function createApp(options: CreateAppOptions = {}): express.Express {
  const env = loadEnv();
  const redis = options.redis ?? (isRedisAvailable() ? getRedis() : undefined);

  const allowedOrigins = env.CORS_ORIGIN.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  const app = express();

  configureEdge(app);

  app.use(helmet());

  app.use(
    cors({
      // Only reflect origins that are explicitly allowlisted (comma-separated
      // in CORS_ORIGIN). Unlisted origins get no Access-Control-* headers, so
      // browsers block them; non-browser clients without an Origin header pass
      // through untouched.
      origin(origin, callback) {
        if (!origin) {
          callback(null, true);
          return;
        }
        callback(null, allowedOrigins.includes(origin));
      },
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: [
        "Content-Type",
        "Authorization",
        "Idempotency-Key",
        "X-Request-Id",
      ],
    }),
  );

  app.use(apiLimiter(redis));

  app.use(requestId);
  app.use(requestHttpMetrics);
  app.use(requestCompletionLogger);

  app.use(express.json({ limit: EDGE_MAX_BODY_BYTES }));
  app.use(express.urlencoded({ extended: true, limit: EDGE_MAX_BODY_BYTES }));

  app.use("/health", healthRoutes);

  if (env.METRICS_ENABLED === "true") {
    app.use("/metrics", metricsRoutes);
  }

  app.use("/api/docs", docsRoutes);

  app.use("/api/v1/auth", authLimiter(redis));

  // Public email-verification / password-recovery endpoints accept
  // unauthenticated email or token input and get their own, tighter budget.
  const emailAuthLeaves = [
    "verify-email",
    "resend-verification",
    "forgot-password",
    "reset-password",
  ];
  for (const leaf of emailAuthLeaves) {
    app.use(`/api/v1/auth/${leaf}`, sensitiveEmailAuthLimiter(redis));
  }

  app.use("/api/v1", apiV1Routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
