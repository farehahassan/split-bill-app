import { Router } from "express";
import { HTTP_STATUSES } from "../constants/http-statuses.js";
import { isDatabaseReachable } from "../db/prisma.js";
import { isRedisAvailable, getRedis } from "../redis/redisClient.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

router.get("/", (_req, res) => {
  res.json({ status: "ok" });
});

router.get(
  "/ready",
  asyncHandler(async (_req, res) => {
    const dbReady = await isDatabaseReachable();

    // Redis is non-fatal for the API server (degrades to in-memory rate
    // limiting), so a Redis outage must not block readiness — but when Redis
    // IS connected we verify it is actually responding.
    let redisReady = true;
    if (isRedisAvailable()) {
      try {
        await getRedis().ping();
      } catch {
        redisReady = false;
      }
    }

    if (!dbReady) {
      res.status(HTTP_STATUSES.SERVICE_UNAVAILABLE).json({
        status: "unavailable",
        message: "Service is not ready yet.",
        checks: { postgres: false, redis: redisReady },
      });
      return;
    }

    res.json({
      status: "ready",
      checks: { postgres: true, redis: redisReady },
    });
  }),
);

export default router;
