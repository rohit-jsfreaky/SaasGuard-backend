/**
 * Admin Check Middleware
 * Verifies that a user is an organization admin
 */

import type { Request, Response, NextFunction } from "express";
import { userRoleService } from "../services/user-role.service.js";
import type { ApiErrorResponse } from "../types/index.js";
import { isDevelopment } from "../config/environment.js";

/**
 * Admin role slugs that grant admin access
 */
const ADMIN_ROLE_SLUGS = ["admin", "owner", "super_admin", "org_admin"];

/**
 * Middleware to verify user is an admin in their organization
 * Returns 403 if user is not an admin
 */
export async function requireAdmin(
  req: Request,
  res: Response<ApiErrorResponse>,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.userId ? parseInt(req.user.userId, 10) : null;
    const orgId = req.user?.organizationId
      ? parseInt(req.user.organizationId, 10)
      : null;

    if (!userId || isNaN(userId)) {
      res.status(401).json({
        success: false,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
      });
      return;
    }

    if (!orgId || isNaN(orgId)) {
      res.status(400).json({
        success: false,
        error: {
          code: "NO_ORGANIZATION",
          message: "Organization context required",
        },
      });
      return;
    }

    // Get user's roles in the organization
    const userRoles = await userRoleService.getUserRoles(userId, orgId);

    // Check if user has any admin role
    const isAdmin = userRoles.some((role) =>
      ADMIN_ROLE_SLUGS.includes(role.slug.toLowerCase())
    );

    if (!isAdmin) {
      if (isDevelopment) {
        console.log(
          `[AdminCheck] DENIED: user=${userId} org=${orgId} - not an admin`
        );
      }

      res.status(403).json({
        success: false,
        error: {
          code: "ADMIN_REQUIRED",
          message: "This action requires admin privileges",
        },
      });
      return;
    }

    if (isDevelopment) {
      console.log(`[AdminCheck] ALLOWED: user=${userId} org=${orgId}`);
    }

    next();
  } catch (error) {
    console.error("[AdminCheck] Error:", error);
    res.status(500).json({
      success: false,
      error: {
        code: "ADMIN_CHECK_ERROR",
        message: "Failed to verify admin status",
      },
    });
  }
}

/**
 * Middleware to verify user is an admin of a SPECIFIC organization
 * Uses orgId from route params instead of user context
 *
 * Usage: router.get('/organizations/:orgId/users', requireOrgAdmin, handler)
 */
export async function requireOrgAdmin(
  req: Request,
  res: Response<ApiErrorResponse>,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.userId ? parseInt(req.user.userId, 10) : null;
    const { orgId } = req.params;
    const targetOrgId = parseInt(orgId ?? "", 10);

    if (!userId || isNaN(userId)) {
      res.status(401).json({
        success: false,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
      });
      return;
    }

    if (isNaN(targetOrgId)) {
      res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Valid organization ID required",
        },
      });
      return;
    }

    // Get user's roles in the target organization
    const userRoles = await userRoleService.getUserRoles(userId, targetOrgId);

    // Check if user has any admin role
    const isAdmin = userRoles.some((role) =>
      ADMIN_ROLE_SLUGS.includes(role.slug.toLowerCase())
    );

    if (!isAdmin) {
      if (isDevelopment) {
        console.log(
          `[AdminCheck] DENIED: user=${userId} org=${targetOrgId} - not an admin`
        );
      }

      res.status(403).json({
        success: false,
        error: {
          code: "ADMIN_REQUIRED",
          message: "You are not an admin of this organization",
        },
      });
      return;
    }

    if (isDevelopment) {
      console.log(`[AdminCheck] ALLOWED: user=${userId} org=${targetOrgId}`);
    }

    next();
  } catch (error) {
    console.error("[AdminCheck] Error:", error);
    res.status(500).json({
      success: false,
      error: {
        code: "ADMIN_CHECK_ERROR",
        message: "Failed to verify admin status",
      },
    });
  }
}

/**
 * Check if a user has a specific role
 * @param userId - User ID
 * @param orgId - Organization ID
 * @param roleSlug - Role slug to check
 * @returns True if user has the role
 */
export async function hasRole(
  userId: number,
  orgId: number,
  roleSlug: string
): Promise<boolean> {
  const userRoles = await userRoleService.getUserRoles(userId, orgId);
  return userRoles.some(
    (role) => role.slug.toLowerCase() === roleSlug.toLowerCase()
  );
}

/**
 * Check if a user is an admin
 * @param userId - User ID
 * @param orgId - Organization ID
 * @returns True if user is an admin
 */
export async function isUserAdmin(
  userId: number,
  orgId: number
): Promise<boolean> {
  const userRoles = await userRoleService.getUserRoles(userId, orgId);
  return userRoles.some((role) =>
    ADMIN_ROLE_SLUGS.includes(role.slug.toLowerCase())
  );
}
