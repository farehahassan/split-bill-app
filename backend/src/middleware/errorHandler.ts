import type { Request, Response, NextFunction } from "express";
import type { AppError, ErrorResponse } from "../types/index.js";
import { ZodError } from "zod";
import { logger } from "../utils/logger.js";

export function createAppError(statusCode: number, code: string, message: string): AppError {
  const error = new Error(message) as AppError;
  error.statusCode = statusCode;
  error.code = code;
  error.isOperational = true;
  return error;
}

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
    res.status(400).json(formatZodError(err));
    return;
  }

  const bodyParserError = err as { type?: string; status?: number };
  if (bodyParserError.type === "entity.parse.failed" || bodyParserError.status === 400) {
    res.status(400).json({
      success: false,
      message: "Invalid JSON request body.",
    } satisfies ErrorResponse);
    return;
  }

  const appError = err as AppError;
  if (appError.isOperational && appError.statusCode) {
    const body: ErrorResponse = {
      success: false,
      message: appError.message,
    };
    res.status(appError.statusCode).json(body);
    return;
  }

  logger.error("Unhandled error", { error: err.message, stack: err.stack });

  res.status(500).json({
    success: false,
    message: "Something went wrong on our side. Please try again later.",
  } satisfies ErrorResponse);
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    message: "Endpoint not found.",
  } satisfies ErrorResponse);
}
