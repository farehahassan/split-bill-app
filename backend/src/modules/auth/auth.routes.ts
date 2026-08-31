import { Router } from "express";

import { validate } from "../../middleware/validate.js";
import { authenticate } from "../../middleware/authenticate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { loginBodySchema, registerBodySchema } from "./validators.js";
import { getMe, login, register } from "./auth.controller.js";

const router = Router();

router.post("/register", validate({ body: registerBodySchema }), asyncHandler(register));
router.post("/login", validate({ body: loginBodySchema }), asyncHandler(login));
router.get("/me", authenticate, asyncHandler(getMe));

export default router;
