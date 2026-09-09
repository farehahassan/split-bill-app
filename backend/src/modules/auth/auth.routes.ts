import { Router } from "express";

import { validate } from "../../middleware/validate.js";
import { authenticate } from "../../middleware/authenticate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { loginBodySchema, refreshTokenBodySchema, registerBodySchema, updateProfileBodySchema } from "./validators.js";
import { getMe, login, logout, refresh, register, updateCurrentUser } from "./auth.controller.js";

const router = Router();

router.post("/register", validate({ body: registerBodySchema }), asyncHandler(register));
router.post("/login", validate({ body: loginBodySchema }), asyncHandler(login));
router.post("/refresh", validate({ body: refreshTokenBodySchema }), asyncHandler(refresh));
router.post("/logout", validate({ body: refreshTokenBodySchema }), asyncHandler(logout));
router.get("/me", authenticate, asyncHandler(getMe));
router.patch(
  "/me",
  authenticate,
  validate({ body: updateProfileBodySchema }),
  asyncHandler(updateCurrentUser),
);

export default router;
