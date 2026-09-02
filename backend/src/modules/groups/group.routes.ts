import { Router } from "express";

import { validate } from "../../middleware/validate.js";
import { authenticate } from "../../middleware/authenticate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import {
  addMemberBodySchema,
  createGroupBodySchema,
  groupParamsSchema,
  memberParamsSchema,
  updateGroupBodySchema,
} from "./validators.js";
import {
  addGroupMember,
  createGroup,
  deleteGroup,
  getGroupById,
  getUserGroups,
  removeGroupMember,
  updateGroup,
} from "./group.controller.js";
import { createExpenseBodySchema, expenseTargetParamsSchema } from "../expenses/validators.js";
import { createExpense, getGroupExpenses } from "../expenses/expense.controller.js";
import {
  createSettlementBodySchema,
  settlementGroupParamsSchema,
} from "../settlements/validators.js";
import {
  createSettlement,
  getGroupBalances,
  getGroupSettlements,
} from "../settlements/settlement.controller.js";

const router = Router();

router.post(
  "/",
  authenticate,
  validate({ body: createGroupBodySchema }),
  asyncHandler(createGroup),
);
router.get("/", authenticate, asyncHandler(getUserGroups));
router.get(
  "/:id",
  authenticate,
  validate({ params: groupParamsSchema }),
  asyncHandler(getGroupById),
);
router.put(
  "/:id",
  authenticate,
  validate({ params: groupParamsSchema, body: updateGroupBodySchema }),
  asyncHandler(updateGroup),
);
router.delete(
  "/:id",
  authenticate,
  validate({ params: groupParamsSchema }),
  asyncHandler(deleteGroup),
);
router.post(
  "/:id/members",
  authenticate,
  validate({ params: groupParamsSchema, body: addMemberBodySchema }),
  asyncHandler(addGroupMember),
);
router.delete(
  "/:id/members/:memberId",
  authenticate,
  validate({ params: memberParamsSchema }),
  asyncHandler(removeGroupMember),
);

router.post(
  "/:id/expenses",
  authenticate,
  validate({ params: expenseTargetParamsSchema, body: createExpenseBodySchema }),
  asyncHandler(createExpense),
);

router.get(
  "/:id/expenses",
  authenticate,
  validate({ params: expenseTargetParamsSchema }),
  asyncHandler(getGroupExpenses),
);

router.get(
  "/:id/balances",
  authenticate,
  validate({ params: settlementGroupParamsSchema }),
  asyncHandler(getGroupBalances),
);

router.post(
  "/:id/settlements",
  authenticate,
  validate({ params: settlementGroupParamsSchema, body: createSettlementBodySchema }),
  asyncHandler(createSettlement),
);

router.get(
  "/:id/settlements",
  authenticate,
  validate({ params: settlementGroupParamsSchema }),
  asyncHandler(getGroupSettlements),
);

export default router;
