/**
 * Custom Error Classes
 * Provides consistent error handling across the application
 */

/**
 * Base application error
 */
export abstract class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public isOperational: boolean;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    statusCode: number,
    code: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    if (details) {
      this.details = details;
    }

    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.message,
        ...(this.details && { details: this.details }),
      },
    };
  }
}

/**
 * 400 Bad Request - Invalid input or validation error
 */
export class ValidationError extends AppError {
  constructor(
    message: string = "Invalid input",
    details?: Record<string, unknown>
  ) {
    super(message, 400, "VALIDATION_ERROR", details);
  }
}

/**
 * 401 Unauthorized - Authentication required
 */
export class UnauthorizedError extends AppError {
  constructor(message: string = "Authentication required") {
    super(message, 401, "UNAUTHORIZED");
  }
}

/**
 * 403 Forbidden - Permission denied
 */
export class ForbiddenError extends AppError {
  constructor(
    message: string = "Permission denied",
    details?: Record<string, unknown>
  ) {
    super(message, 403, "FORBIDDEN", details);
  }
}

/**
 * 403 Feature Not Available - Feature not in plan
 */
export class FeatureNotAvailableError extends AppError {
  constructor(featureSlug: string) {
    super(
      `Feature "${featureSlug}" is not available in your plan`,
      403,
      "FEATURE_NOT_AVAILABLE",
      { feature: featureSlug }
    );
  }
}

/**
 * 404 Not Found - Resource not found
 */
export class NotFoundError extends AppError {
  constructor(resource: string = "Resource", id?: string | number) {
    const message = id
      ? `${resource} not found: ${id}`
      : `${resource} not found`;
    super(message, 404, "NOT_FOUND", { resource, id });
  }
}

/**
 * 409 Conflict - Resource already exists
 */
export class ConflictError extends AppError {
  constructor(
    message: string = "Resource already exists",
    details?: Record<string, unknown>
  ) {
    super(message, 409, "CONFLICT", details);
  }
}

/**
 * 429 Too Many Requests - Rate limit exceeded
 */
export class RateLimitError extends AppError {
  constructor(
    featureSlug: string,
    limit?: { max: number; used: number; remaining: number }
  ) {
    super(
      `You've reached your usage limit for "${featureSlug}" this month`,
      429,
      "LIMIT_EXCEEDED",
      { feature: featureSlug, ...(limit && { limit }) }
    );
  }
}

/**
 * 500 Internal Server Error
 */
export class InternalError extends AppError {
  constructor(
    message: string = "An internal error occurred",
    requestId?: string
  ) {
    super(
      message,
      500,
      "INTERNAL_ERROR",
      requestId ? { requestId } : undefined
    );
    this.isOperational = false;
  }
}

/**
 * 503 Service Unavailable
 */
export class ServiceUnavailableError extends AppError {
  constructor(service: string = "Service") {
    super(`${service} is currently unavailable`, 503, "SERVICE_UNAVAILABLE");
  }
}

/**
 * Check if error is an AppError
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Wrap any error into an AppError
 */
export function wrapError(error: unknown, requestId?: string): AppError {
  if (isAppError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return new InternalError(error.message, requestId);
  }

  return new InternalError("An unexpected error occurred", requestId);
}
