/**
 * Request ID Middleware
 * Generates unique request IDs for tracking and debugging
 */

import type { Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";

/**
 * Extended request with request ID
 */
declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

/**
 * Request ID header name
 */
const REQUEST_ID_HEADER = "X-Request-ID";

/**
 * Middleware to generate and attach request ID
 * - Uses existing ID from header if present
 * - Generates new UUID if not
 * - Adds to request object and response headers
 */
export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Use existing ID from header or generate new one
  const requestId =
    (req.headers[REQUEST_ID_HEADER.toLowerCase()] as string) || uuidv4();

  // Attach to request
  req.requestId = requestId;

  // Add to response headers
  res.setHeader(REQUEST_ID_HEADER, requestId);

  next();
}

/**
 * Get request ID from request object
 */
export function getRequestId(req: Request): string {
  return req.requestId || "unknown";
}

export default requestIdMiddleware;
