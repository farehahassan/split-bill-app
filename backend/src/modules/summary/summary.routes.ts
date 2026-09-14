import { Router } from "express";

import { authenticate } from "../../middleware/authenticate.js";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { getGroupSummary, requestGroupSummaryRecompute } from "./summary.controller.js";
import { summaryGroupParamsSchema } from "./summary.validators.js";

const router = Router({ mergeParams: true });

router.get(
  "/",
  authenticate,
  validate({ params: summaryGroupParamsSchema }),
  asyncHandler(getGroupSummary),
);

router.post(
  "/recompute",
  authenticate,
  validate({ params: summaryGroupParamsSchema }),
  asyncHandler(requestGroupSummaryRecompute),
);

export default router;
