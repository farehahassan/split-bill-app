import { HTTP_STATUSES } from "../constants/http-statuses.js";

/**
 * Base application error. Carries every field the centralized error handler
 * needs to produce a consistent, machine-readable HTTP error response.
 *
 * Subclass-specific instances are thrown throughout the domain layer; the
 * centralized error middleware inspects `instanceof AppError` to serialize them
 * without exposing internal stack traces, Prisma errors, or SQL.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly isOperational: boolean;

  constructor(statusCode: number, code: string, message: string, isOperational = true) {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    Error.captureStackTrace?.(this, new.target);
  }
}

/**
 * Resource already exists or conflicts with existing data (HTTP 409).
 */
export class ConflictError extends AppError {
  constructor(code: string, message: string) {
    super(HTTP_STATUSES.CONFLICT, code, message);
  }
}

/**
 * The request is missing or failed authentication/authorization (HTTP 401).
 */
export class UnauthorizedError extends AppError {
  constructor(code: string, message: string) {
    super(HTTP_STATUSES.UNAUTHORIZED, code, message);
  }
}

/**
 * The requested resource does not exist (HTTP 404).
 */
export class NotFoundError extends AppError {
  constructor(code: string, message: string) {
    super(HTTP_STATUSES.NOT_FOUND, code, message);
  }
}
