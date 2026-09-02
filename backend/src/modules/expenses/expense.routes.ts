import { Router } from "express";

import { authenticate } from "../../middleware/authenticate.js";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { expenseParamsSchema } from "./validators.js";
import { getExpenseById } from "./expense.controller.js";

const router = Router();

router.get(
  "/:id",
  authenticate,
  validate({ params: expenseParamsSchema }),
  asyncHandler(getExpenseById),
);

export default router;
