import { Router } from "express";

import { validate } from "../../middleware/validate.js";
import { authenticate } from "../../middleware/authenticate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import {
  forgotPasswordBodySchema,
  loginBodySchema,
  refreshTokenBodySchema,
  registerBodySchema,
  resendVerificationBodySchema,
  resetPasswordBodySchema,
  updateProfileBodySchema,
  verifyEmailBodySchema,
} from "./validators.js";
import {
  forgotPassword,
  getMe,
  login,
  logout,
  refresh,
  register,
  resendVerification,
  resetPassword,
  updateCurrentUser,
  verifyEmail,
} from "./auth.controller.js";

const router = Router();

router.post("/register", validate({ body: registerBodySchema }), asyncHandler(register));
router.post("/login", validate({ body: loginBodySchema }), asyncHandler(login));
router.post("/refresh", validate({ body: refreshTokenBodySchema }), asyncHandler(refresh));
router.post("/logout", validate({ body: refreshTokenBodySchema }), asyncHandler(logout));
router.post("/verify-email", validate({ body: verifyEmailBodySchema }), asyncHandler(verifyEmail));
router.post(
  "/resend-verification",
  validate({ body: resendVerificationBodySchema }),
  asyncHandler(resendVerification),
);
router.post(
  "/forgot-password",
  validate({ body: forgotPasswordBodySchema }),
  asyncHandler(forgotPassword),
);
router.post(
  "/reset-password",
  validate({ body: resetPasswordBodySchema }),
  asyncHandler(resetPassword),
);
router.get("/me", authenticate, asyncHandler(getMe));
router.patch(
  "/me",
  authenticate,
  validate({ body: updateProfileBodySchema }),
  asyncHandler(updateCurrentUser),
);

export default router;
