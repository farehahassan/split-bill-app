import type { RequestHandler } from "express";

import { HTTP_STATUSES } from "../constants/http-statuses.js";
import { sanitizeRequestId } from "../utils/requestId.js";

/**
 * Matches the `express.json` / `express.urlencoded` body limit ("10mb") so the
 * edge layer and the body parser agree on what is acceptable.
 */
export const EDGE_MAX_BODY_BYTES = 10 * 1024 * 1024;

const EDGE_MAX_URL_LENGTH = 2048;

// C0 control characters plus DEL (log/session injection vectors). Scanned
// explicitly so the URL target never passes raw control characters downstream.
function hasControlCharacters(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

/**
 * Coarse, domain-free screening that runs before anything else in the request
 * pipeline (before helmet, CORS, rate limiting, and body parsing):
 *
 * - Rejects URLs carrying control characters (log/session injection vectors).
 * - Rejects absurdly long URLs.
 * - Rejects requests whose declared `Content-Length` exceeds the body limit
 *   before the body parser spends any effort on them (HTTP 413).
 * - Normalizes the incoming `X-Request-Id` header. Well-formed IDs pass
 *   through untouched; poorly formed IDs are removed so the request-ID
 *   middleware issues a fresh UUID — preserving the app's resilient
 *   sanitize-and-fallback contract for tracing while keeping malformed
 *   characters out of logs.
 *
 * The guard contains no business logic and performs no I/O beyond reading
 * headers.
 */
export function edgeRequestGuard(): RequestHandler {
  return (req, res, next) => {
    const target = `${req.method} ${req.originalUrl ?? req.url}`;

    if (hasControlCharacters(target)) {
      res.status(HTTP_STATUSES.NOT_FOUND).json({ success: false, message: "Endpoint not found." });
      return;
    }

    if ((req.originalUrl ?? req.url).length > EDGE_MAX_URL_LENGTH) {
      res.status(HTTP_STATUSES.NOT_FOUND).json({ success: false, message: "Endpoint not found." });
      return;
    }

    const rawContentLength = req.headers["content-length"];
    if (rawContentLength !== undefined) {
      const contentLength = Number(rawContentLength);
      if (Number.isFinite(contentLength) && contentLength > EDGE_MAX_BODY_BYTES) {
        res
          .status(HTTP_STATUSES.PAYLOAD_TOO_LARGE)
          .json({ success: false, message: "Request body too large." });
        return;
      }
    }

    const incomingId = req.headers["x-request-id"];
    const rawId = Array.isArray(incomingId) ? incomingId[0] : incomingId;
    if (rawId !== undefined && sanitizeRequestId(rawId) === null) {
      delete req.headers["x-request-id"];
    }

    next();
  };
}
