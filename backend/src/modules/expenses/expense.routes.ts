import { Router } from "express";

import { authenticate } from "../../middleware/authenticate.js";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { expenseParamsSchema, updateExpenseBodySchema } from "./validators.js";
import { deleteExpense, getExpenseById, updateExpense } from "./expense.controller.js";

const router = Router();

router.get(
  "/:id",
  authenticate,
  validate({ params: expenseParamsSchema }),
  asyncHandler(getExpenseById),
);

router.patch(
  "/:id",
  authenticate,
  validate({ params: expenseParamsSchema, body: updateExpenseBodySchema }),
  asyncHandler(updateExpense),
);

router.delete(
  "/:id",
  authenticate,
  validate({ params: expenseParamsSchema }),
  asyncHandler(deleteExpense),
);

export default router;
