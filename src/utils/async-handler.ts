/**
 * Async Handler Utility
 * Wraps async route handlers to automatically catch errors and send appropriate responses
 */

import type { Request, Response, NextFunction } from "express";
import type { ApiResponse, ApiErrorResponse } from "../types/index.js";
import {
  isAppError,
  wrapError,
} from "./errors.js";
import { logger } from "../config/logger.js";
import { getRequestId } from "../middleware/request-id.middleware.js";

/**
 * Controller function type that returns data or throws an error
 */
export type ControllerFunction<TData = unknown> = (
  req: Request,
  res: Response
) => Promise<TData>;

/**
 * Options for async handler
 */
interface AsyncHandlerOptions {
  /** Custom error code for generic errors */
  defaultErrorCode?: string;
  /** Custom status code for generic errors */
  defaultStatusCode?: number;
  /** Whether to log errors */
  logErrors?: boolean;
}

/**
 * Wraps an async controller function to handle errors automatically
 * 
 * @example
 * ```ts
 * router.get("/", asyncHandler(async (req, res) => {
 *   const data = await someService.getData();
 *   return { data, message: "Success" };
 * }));
 * ```
 */
export function asyncHandler<TData = unknown>(
  controller: ControllerFunction<TData>,
  options: AsyncHandlerOptions = {}
): (
  req: Request,
  res: Response<ApiResponse<TData> | ApiErrorResponse>,
  next: NextFunction
) => Promise<void> {
  const {
    defaultErrorCode = "INTERNAL_ERROR",
    defaultStatusCode = 500,
    logErrors = true,
  } = options;

  return async (
    req: Request,
    res: Response<ApiResponse<TData> | ApiErrorResponse>,
    _next: NextFunction
  ): Promise<void> => {
    try {
      const result = await controller(req, res);

      // Get status code (may have been set by controller)
      const statusCode = res.statusCode || 200;

      // If result is already a response object, send it
      if (result && typeof result === "object" && "success" in result && "data" in result) {
        res.status(statusCode).json(result as ApiResponse<TData>);
        return;
      }

      // Otherwise wrap in standard response
      res.status(statusCode).json({
        success: true,
        data: result as TData,
      });
    } catch (error) {
      const requestId = getRequestId(req);
      const appError = isAppError(error) ? error : wrapError(error, requestId);

      // Map common error messages to appropriate status codes
      let statusCode = appError.statusCode;
      let errorCode = appError.code;
      const message = appError.message;

      // Handle specific error patterns
      if (message.includes("not found")) {
        statusCode = 404;
        errorCode = "NOT_FOUND";
      } else if (message.includes("already exists") || message.includes("duplicate")) {
        statusCode = 409;
        errorCode = "DUPLICATE_SLUG";
      } else if (message.includes("Invalid") || message.includes("required")) {
        statusCode = 400;
        errorCode = "VALIDATION_ERROR";
      } else if (!isAppError(error)) {
        // Use defaults for unknown errors
        statusCode = defaultStatusCode;
        errorCode = defaultErrorCode;
      }

      // Log error if enabled
      if (logErrors) {
        const logContext = {
          requestId,
          method: req.method,
          path: req.path,
          statusCode,
          errorCode,
          userId: req.user?.userId,
          orgId: req.user?.organizationId,
        };

        if (appError.isOperational) {
          logger.warn(logContext, `[${errorCode}] ${message}`);
        } else {
          logger.error(
            {
              ...logContext,
              stack: appError.stack,
              originalError: error instanceof Error ? error.message : String(error),
            },
            `[${errorCode}] ${message}`
          );
        }
      }

      // Send error response
      const errorResponse: ApiErrorResponse = {
        success: false,
        error: {
          code: errorCode,
          message: appError.isOperational
            ? message
            : "An internal error occurred",
          ...(appError.details && { details: appError.details }),
        },
      };

      res.status(statusCode).json(errorResponse);
    }
  };
}

/**
 * Helper to create a success response
 */
export function successResponse<TData>(
  data: TData,
  message?: string,
  statusCode: number = 200
): { statusCode: number; response: ApiResponse<TData> } {
  return {
    statusCode,
    response: {
      success: true,
      data,
      ...(message && { message }),
    },
  };
}

/**
 * Helper to create an error response
 */
export function errorResponse(
  code: string,
  message: string,
  statusCode: number = 500,
  details?: Record<string, unknown>
): { statusCode: number; response: ApiErrorResponse } {
  return {
    statusCode,
    response: {
      success: false,
      error: {
        code,
        message,
        ...(details && { details }),
      },
    },
  };
}

