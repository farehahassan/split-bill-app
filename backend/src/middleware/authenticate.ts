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
      idempotencyKey?: string;
      requestId?: string;
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

  // Strict Bearer parsing: the header must be exactly one scheme followed by
  // one non-empty token. Extra whitespace/tokens ("Bearer a b", leading
  // spaces, empty token) are rejected rather than loosely accepted.
  const parts = header.trim().split(/\s+/);
  const scheme = parts[0];
  const token = parts[1];
  if (
    parts.length !== 2 ||
    scheme === undefined ||
    token === undefined ||
    scheme.toLowerCase() !== "bearer" ||
    token.length === 0
  ) {
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
