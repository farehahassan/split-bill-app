import { Router } from "express";

import { validate } from "../../middleware/validate.js";
import { authenticate } from "../../middleware/authenticate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { settlementParamsSchema } from "./validators.js";
import { getSettlementById } from "./settlement.controller.js";

const router = Router();

router.get(
  "/:id",
  authenticate,
  validate({ params: settlementParamsSchema }),
  asyncHandler(getSettlementById),
);

export default router;
