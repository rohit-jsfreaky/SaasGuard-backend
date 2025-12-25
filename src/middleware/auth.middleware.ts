import type { Request, Response, NextFunction } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import type { UserContext, ApiErrorResponse } from "../types/index.js";
import { isDevelopment } from "../config/environment.js";

/**
 * Extend Express Request to include user context
 */
declare global {
  namespace Express {
    interface Request {
      user?: UserContext;
    }
  }
}

/**
 * Send authentication error response
 */
function sendAuthError(
  res: Response<ApiErrorResponse>,
  status: number,
  code: string,
  message: string
): void {
  res.status(status).json({
    success: false,
    error: { code, message },
  });
}

/**
 * Authentication Middleware
 * Uses Clerk's getAuth() to extract user context from the request
 * Should be used AFTER clerkMiddleware() is applied
 *
 * Usage:
 *   app.use(clerkMiddleware());
 *   app.use('/api/v1', authMiddleware, routes);
 */
export async function authMiddleware(
  req: Request,
  res: Response<ApiErrorResponse>,
  next: NextFunction
): Promise<void> {
  try {
    const auth = getAuth(req);

    // Check if user is authenticated
    if (!auth.userId) {
      if (isDevelopment) {
        console.debug(`[Auth] No userId for ${req.method} ${req.path}`);
      }
      sendAuthError(res, 401, "UNAUTHORIZED", "Authentication required");
      return;
    }

    // Build user context from Clerk auth
    const userContext: UserContext = {
      userId: auth.userId,
      email: "", // Will be fetched if needed
      sessionId: auth.sessionId ?? "",
      organizationId: auth.orgId,
      organizationRole: auth.orgRole,
    };

    // Attach user context to request
    req.user = userContext;

    if (isDevelopment) {
      console.debug(
        `[Auth] Authenticated: user=${auth.userId}, org=${auth.orgId ?? "none"}`
      );
    }

    next();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Authentication failed";
    console.warn(`[Auth] Error for ${req.method} ${req.path}: ${message}`);
    sendAuthError(res, 401, "AUTH_ERROR", "Authentication failed");
  }
}

/**
 * Require authentication middleware
 * Use this for routes that MUST have a valid user
 * Throws 401 if no user context is available
 */
export function requireAuth(
  req: Request,
  res: Response<ApiErrorResponse>,
  next: NextFunction
): void {
  const auth = getAuth(req);

  if (!auth.userId) {
    sendAuthError(res, 401, "UNAUTHORIZED", "Authentication required");
    return;
  }

  // Ensure user context is set
  if (!req.user) {
    req.user = {
      userId: auth.userId,
      email: "",
      sessionId: auth.sessionId ?? "",
      organizationId: auth.orgId,
      organizationRole: auth.orgRole,
    };
  }

  next();
}

/**
 * Require organization context middleware
 * Use this for routes that need an organization context
 * Throws 403 if user is not in an organization
 */
export function requireOrganization(
  req: Request,
  res: Response<ApiErrorResponse>,
  next: NextFunction
): void {
  const auth = getAuth(req);

  if (!auth.userId) {
    sendAuthError(res, 401, "UNAUTHORIZED", "Authentication required");
    return;
  }

  if (!auth.orgId) {
    sendAuthError(
      res,
      403,
      "NO_ORGANIZATION",
      "This action requires an organization context"
    );
    return;
  }

  // Ensure user context is set
  if (!req.user) {
    req.user = {
      userId: auth.userId,
      email: "",
      sessionId: auth.sessionId ?? "",
      organizationId: auth.orgId,
      organizationRole: auth.orgRole,
    };
  }

  next();
}

/**
 * Optional authentication middleware
 * Attempts to set user context but doesn't fail if not authenticated
 * Useful for routes that work with or without auth
 */
export function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  try {
    const auth = getAuth(req);

    if (auth.userId) {
      req.user = {
        userId: auth.userId,
        email: "",
        sessionId: auth.sessionId ?? "",
        organizationId: auth.orgId,
        organizationRole: auth.orgRole,
      };
    }
  } catch {
    // Silently ignore - optional auth
  }

  next();
}

/**
 * Get user details from Clerk
 * Use this when you need full user information (email, name, etc.)
 */
export async function getUserDetails(userId: string) {
  try {
    const user = await clerkClient.users.getUser(userId);
    return {
      id: user.id,
      email: user.emailAddresses[0]?.emailAddress ?? "",
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || null,
      imageUrl: user.imageUrl,
      createdAt: new Date(user.createdAt),
      updatedAt: new Date(user.updatedAt),
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to get user";
    throw new Error(`User not found: ${message}`);
  }
}

/**
 * Export clerkClient for direct access
 */
export { clerkClient };
