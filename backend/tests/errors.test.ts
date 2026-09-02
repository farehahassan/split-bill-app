import { describe, it, expect } from "vitest";
import { HTTP_STATUSES } from "../src/constants/http-statuses.js";
import { APP_ERRORS } from "../src/constants/app-errors.js";
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from "../src/errors/app.error.js";

describe("AppError class hierarchy", () => {
  it("should build an AppError with the expected operational contract", () => {
    const error = new AppError(HTTP_STATUSES.BAD_REQUEST, "VALIDATION", "Invalid input");

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AppError);
    expect(error.name).toBe("AppError");
    expect(error.statusCode).toBe(HTTP_STATUSES.BAD_REQUEST);
    expect(error.code).toBe("VALIDATION");
    expect(error.message).toBe("Invalid input");
    expect(error.isOperational).toBe(true);
  });

  it("should allow marking an AppError as non-operational", () => {
    const error = new AppError(HTTP_STATUSES.INTERNAL_SERVER_ERROR, "DB", "boom", false);
    expect(error.isOperational).toBe(false);
  });

  it("ConflictError should map to 409 Conflict with the given code", () => {
    const error = new ConflictError(APP_ERRORS.EMAIL_IN_USE, "Already exists.");
    expect(error).toBeInstanceOf(AppError);
    expect(error.name).toBe("ConflictError");
    expect(error.statusCode).toBe(HTTP_STATUSES.CONFLICT);
    expect(error.code).toBe(APP_ERRORS.EMAIL_IN_USE);
  });

  it("UnauthorizedError should map to 401 Unauthorized with the given code", () => {
    const error = new UnauthorizedError(APP_ERRORS.INVALID_CREDENTIALS, "Invalid credentials.");
    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(HTTP_STATUSES.UNAUTHORIZED);
    expect(error.code).toBe(APP_ERRORS.INVALID_CREDENTIALS);
  });

  it("ForbiddenError should map to 403 Forbidden with the given code", () => {
    const error = new ForbiddenError(APP_ERRORS.NOT_GROUP_OWNER, "Not allowed.");
    expect(error).toBeInstanceOf(AppError);
    expect(error.name).toBe("ForbiddenError");
    expect(error.statusCode).toBe(HTTP_STATUSES.FORBIDDEN);
    expect(error.code).toBe(APP_ERRORS.NOT_GROUP_OWNER);
  });

  it("NotFoundError should map to 404 Not Found with the given code", () => {
    const error = new NotFoundError(APP_ERRORS.USER_NOT_FOUND, "User not found.");
    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(HTTP_STATUSES.NOT_FOUND);
    expect(error.code).toBe(APP_ERRORS.USER_NOT_FOUND);
  });
});
