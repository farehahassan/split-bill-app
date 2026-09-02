import { Router } from "express";
import authRoutes from "../../modules/auth/auth.routes.js";
import groupRoutes from "../../modules/groups/group.routes.js";

const router = Router();

router.use("/auth", authRoutes);
router.use("/groups", groupRoutes);

export default router;
