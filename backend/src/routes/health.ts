import { Router } from "express";
import { HTTP_STATUSES } from "../constants/http-statuses.js";
import { isDatabaseReachable } from "../db/prisma.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

router.get("/", (_req, res) => {
  res.json({ status: "ok" });
});

router.get(
  "/ready",
  asyncHandler(async (_req, res) => {
    const ready = await isDatabaseReachable();
    if (!ready) {
      res.status(HTTP_STATUSES.SERVICE_UNAVAILABLE).json({
        status: "unavailable",
        message: "Service is not ready yet.",
      });
      return;
    }
    res.json({ status: "ready" });
  }),
);

export default router;
