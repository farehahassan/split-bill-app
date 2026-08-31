import type { Request, Response, NextFunction, RequestHandler } from "express";

type AsyncRequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<unknown>;

/**
 * Wraps an asynchronous Express request handler so that both synchronous
 * throws and rejected promises are forwarded to the centralized error handler
 * via `next()`. This removes the need for repetitive try/catch blocks inside
 * controllers and guarantees consistent error reporting across the application.
 */
export function asyncHandler(handler: AsyncRequestHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve()
      .then(() => handler(req, res, next))
      .catch(next);
  };
}
