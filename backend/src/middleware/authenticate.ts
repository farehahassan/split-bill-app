import type { Request, Response, NextFunction } from "express";

import { APP_ERRORS } from "../constants/app-errors.js";
import { UnauthorizedError } from "../errors/app.error.js";
import { AuthService } from "../modules/auth/auth.service.js";
import { AuthRepository } from "../modules/auth/auth.repository.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

const authService = new AuthService(new AuthRepository());

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header) {
    next(new UnauthorizedError(APP_ERRORS.TOKEN_MISSING, "Authentication token is required."));
    return;
  }

  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) {
    next(new UnauthorizedError(APP_ERRORS.TOKEN_MISSING, "Bearer token is required."));
    return;
  }

  try {
    const payload = authService.verifyToken(token);
    req.userId = payload.sub;
    next();
  } catch (error) {
    next(error);
  }
}
