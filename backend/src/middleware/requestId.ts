import { randomUUID } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

import { REQUEST_ID_HEADER, sanitizeRequestId } from "../utils/requestId.js";

/**
 * Assigns a request ID to every HTTP request and sets the `X-Request-Id`
 * response header so callers can correlate requests. The ID is always
 * available on `req.requestId` for downstream middleware, controllers,
 * and the logger.
 *
 * Client-provided `X-Request-Id` values are accepted when they are
 * ≤128 characters and contain only safe tracing characters. Malformed
 * or missing values fall back to a freshly generated UUID v4. The validation
 * rule lives in `utils/requestId.ts` (shared with the edge request guard).
 */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers[REQUEST_ID_HEADER.toLowerCase()];
  const raw = Array.isArray(incoming) ? incoming[0] : incoming;

  const id = (raw && sanitizeRequestId(raw)) || randomUUID();

  req.requestId = id;
  res.setHeader(REQUEST_ID_HEADER, id);

  next();
}
