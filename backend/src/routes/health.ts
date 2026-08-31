import { Router } from "express";

const router = Router();

router.get("/", (_req, res) => {
  res.json({ status: "ok" });
});

router.get("/ready", (_req, res) => {
  res.json({ status: "ok" });
});

export default router;
