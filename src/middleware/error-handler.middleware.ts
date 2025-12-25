/**
 * Global Error Handler Middleware
 * Catches all errors and returns consistent error responses
 */

import type {
  Request,
  Response,
  NextFunction,
  ErrorRequestHandler,
} from "express";
import { wrapError } from "../utils/errors.js";
import { logger } from "../config/logger.js";
import { isDevelopment } from "../config/environment.js";
import { getRequestId } from "./request-id.middleware.js";

/**
 * Error response structure
 */
interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    requestId?: string;
    stack?: string;
  };
}

/**
 * Global error handler middleware
 * Should be registered AFTER all routes
 */
export const errorHandler: ErrorRequestHandler = (
  err: unknown,
  req: Request,
  res: Response<ErrorResponse>,
  _next: NextFunction
): void => {
  const requestId = getRequestId(req);
  const appError = wrapError(err, requestId);

  // Get user context safely
  const userId = req.user?.userId;
  const orgId = req.user?.organizationId;

  // Log the error
  const logContext = {
    requestId,
    userId,
    orgId,
    method: req.method,
    path: req.path,
    statusCode: appError.statusCode,
    errorCode: appError.code,
    isOperational: appError.isOperational,
  };

  if (appError.isOperational) {
    // Operational errors are expected
    logger.warn(logContext, `[${appError.code}] ${appError.message}`);
  } else {
    // Unexpected errors need investigation
    logger.error(
      {
        ...logContext,
        stack: appError.stack,
        originalError: err instanceof Error ? err.message : String(err),
      },
      `[${appError.code}] ${appError.message}`
    );
  }

  // Build response
  const response: ErrorResponse = {
    success: false,
    error: {
      code: appError.code,
      message: appError.isOperational
        ? appError.message
        : "An internal error occurred",
      requestId,
    },
  };

  // Include details for operational errors
  if (appError.isOperational && appError.details) {
    response.error.details = appError.details;
  }

  // Include stack trace in development
  if (isDevelopment && appError.stack) {
    response.error.stack = appError.stack;
  }

  res.status(appError.statusCode).json(response);
};

/**
 * Async error wrapper
 * Wraps async route handlers to catch errors
 */
export function asyncHandler<T>(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<T>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Not found handler
 * Returns 404 for unmatched routes
 */
export function notFoundHandler(req: Request, res: Response): void {
  const requestId = getRequestId(req);

  res.status(404).json({
    success: false,
    error: {
      code: "NOT_FOUND",
      message: `Route not found: ${req.method} ${req.path}`,
      requestId,
    },
  });
}

export default errorHandler;
