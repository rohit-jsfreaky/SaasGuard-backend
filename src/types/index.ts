import type { Request } from "express";

/**
 * User context from Clerk authentication
 */
export interface UserContext {
  /** Clerk user ID */
  userId: string;
  /** User's primary email */
  email: string;
  /** User's display name */
  name?: string;
  /** Organization ID if applicable */
  organizationId?: string;
  /** Organization role if applicable */
  organizationRole?: string;
  /** Session ID */
  sessionId: string;
}

/**
 * Express Request extended with authenticated user context
 */
export interface AuthenticatedRequest extends Request {
  user: UserContext;
}

/**
 * Standard API success response
 */
export interface ApiResponse<T> {
  success: true;
  data: T;
  message?: string;
}

/**
 * Standard API error response
 */
export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

/**
 * Pagination metadata
 */
export interface PaginationMeta {
  /** Current page number (1-indexed) */
  page: number;
  /** Number of items per page */
  limit: number;
  /** Total number of items */
  total: number;
  /** Total number of pages */
  totalPages: number;
  /** Whether there is a next page */
  hasNextPage: boolean;
  /** Whether there is a previous page */
  hasPreviousPage: boolean;
}

/**
 * Paginated API response
 */
export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: PaginationMeta;
}

/**
 * Query parameters for paginated requests
 */
export interface PaginationQuery {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

/**
 * Generic ID parameter type
 */
export interface IdParam {
  id: string;
}

/**
 * Helper type for async route handlers
 */
export type AsyncHandler<
  TRequest extends Request = Request,
  TResponse = unknown
> = (
  req: TRequest,
  res: import("express").Response<TResponse>,
  next: import("express").NextFunction
) => Promise<void>;
