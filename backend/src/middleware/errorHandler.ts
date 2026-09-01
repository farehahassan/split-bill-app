import type { Request, Response, NextFunction } from "express";
import type { ErrorResponse } from "../types/index.js";
import { ZodError } from "zod";
import { logger } from "../utils/logger.js";
import { HTTP_STATUSES } from "../constants/http-statuses.js";
import { AppError } from "../errors/app.error.js";

function formatZodError(error: ZodError): ErrorResponse {
  const errors = error.issues.map((issue) => ({
    field: issue.path.join("."),
    message: issue.message,
  }));
  return {
    success: false,
    message: "Validation failed",
    errors,
  };
}

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ZodError) {
    res.status(HTTP_STATUSES.BAD_REQUEST).json(formatZodError(err));
    return;
  }

  const bodyParserError = err as { type?: string; status?: number };
  if (
    bodyParserError.type === "entity.parse.failed" ||
    bodyParserError.status === HTTP_STATUSES.BAD_REQUEST
  ) {
    res.status(HTTP_STATUSES.BAD_REQUEST).json({
      success: false,
      message: "Invalid JSON request body.",
    } satisfies ErrorResponse);
    return;
  }

  if (err instanceof AppError) {
    const body: ErrorResponse = {
      success: false,
      message: err.message,
    };
    res.status(err.statusCode).json(body);
    return;
  }

  logger.error("Unhandled error", { error: err.message, stack: err.stack });

  res.status(HTTP_STATUSES.INTERNAL_SERVER_ERROR).json({
    success: false,
    message: "Something went wrong on our side. Please try again later.",
  } satisfies ErrorResponse);
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(HTTP_STATUSES.NOT_FOUND).json({
    success: false,
    message: "Endpoint not found.",
  } satisfies ErrorResponse);
}
