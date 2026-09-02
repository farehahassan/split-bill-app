import { Router } from "express";
import authRoutes from "../../modules/auth/auth.routes.js";
import groupRoutes from "../../modules/groups/group.routes.js";
import expenseRoutes from "../../modules/expenses/expense.routes.js";
import settlementRoutes from "../../modules/settlements/settlement.routes.js";

const router = Router();

router.use("/auth", authRoutes);
router.use("/groups", groupRoutes);
router.use("/expenses", expenseRoutes);
router.use("/settlements", settlementRoutes);

export default router;
