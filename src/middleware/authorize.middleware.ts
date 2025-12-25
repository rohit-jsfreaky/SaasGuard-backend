/**
 * Authorization Middleware
 * Enforces feature-based permissions on API routes
 *
 * CRITICAL: This is the backend security layer
 * NEVER trust frontend permissions - always enforce here
 */

import type { Request, Response, NextFunction } from "express";
import { permissionResolutionService } from "../services/permission-resolution.service.js";
import { checkReason } from "../utils/permission-check.js";
import type { ApiErrorResponse } from "../types/index.js";
import { isDevelopment } from "../config/environment.js";

/**
 * Authorization middleware factory
 * Creates middleware that checks if user has permission for a feature
 *
 * @param requiredFeature - Feature slug that must be enabled
 * @param planId - Optional plan ID to use for resolution
 * @returns Express middleware function
 *
 * Usage:
 * router.post('/posts', authorize('create_post'), handler)
 */
export function authorize(requiredFeature: string, planId?: number) {
  return async (
    req: Request,
    res: Response<ApiErrorResponse>,
    next: NextFunction
  ): Promise<void> => {
    try {
      // Get user from auth middleware
      const userId = req.user?.userId ? parseInt(req.user.userId, 10) : null;
      const orgId = req.user?.organizationId
        ? parseInt(req.user.organizationId, 10)
        : null;

      // Must have authenticated user
      if (!userId || isNaN(userId)) {
        res.status(401).json({
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Authentication required",
          },
        });
        return;
      }

      // Must have organization context
      if (!orgId || isNaN(orgId)) {
        res.status(400).json({
          success: false,
          error: {
            code: "NO_ORGANIZATION",
            message: "Organization context required for authorization",
          },
        });
        return;
      }

      // Resolve permissions
      const permissions = await permissionResolutionService.resolvePermissions(
        userId,
        orgId,
        planId
      );

      // Check permission (feature only, not limits)
      const check = checkReason(permissions, requiredFeature);

      if (!check.allowed) {
        // Log denied access
        if (isDevelopment) {
          console.log(
            `[Authorization] DENIED: user=${userId} org=${orgId} feature=${requiredFeature} reason=${check.code}`
          );
        }

        // Return appropriate error
        if (check.code === "LIMIT_EXCEEDED") {
          res.status(429).json({
            success: false,
            error: {
              code: "LIMIT_EXCEEDED",
              message: check.reason,
              details: {
                feature: requiredFeature,
                limit: permissions.limits[requiredFeature],
              },
            },
          });
          return;
        }

        res.status(403).json({
          success: false,
          error: {
            code: "FORBIDDEN",
            message: check.reason,
            details: {
              feature: requiredFeature,
            },
          },
        });
        return;
      }

      // Attach permissions to request for use in handler
      (req as Request & { permissions: typeof permissions }).permissions =
        permissions;

      if (isDevelopment) {
        console.log(
          `[Authorization] ALLOWED: user=${userId} org=${orgId} feature=${requiredFeature}`
        );
      }

      next();
    } catch (error) {
      console.error("[Authorization] Error:", error);
      res.status(500).json({
        success: false,
        error: {
          code: "AUTHORIZATION_ERROR",
          message: "Failed to check authorization",
        },
      });
    }
  };
}

/**
 * Check multiple features at once
 * All features must be allowed for request to proceed
 *
 * @param requiredFeatures - Array of feature slugs
 * @param planId - Optional plan ID
 * @returns Express middleware function
 *
 * Usage:
 * router.post('/export', authorizeAll(['export_data', 'view_reports']), handler)
 */
export function authorizeAll(requiredFeatures: string[], planId?: number) {
  return async (
    req: Request,
    res: Response<ApiErrorResponse>,
    next: NextFunction
  ): Promise<void> => {
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

      const permissions = await permissionResolutionService.resolvePermissions(
        userId,
        orgId,
        planId
      );

      // Check all features
      for (const feature of requiredFeatures) {
        const check = checkReason(permissions, feature);
        if (!check.allowed) {
          if (isDevelopment) {
            console.log(
              `[Authorization] DENIED ALL: user=${userId} feature=${feature} reason=${check.code}`
            );
          }

          const status = check.code === "LIMIT_EXCEEDED" ? 429 : 403;
          res.status(status).json({
            success: false,
            error: {
              code: check.code,
              message: check.reason,
              details: { feature },
            },
          });
          return;
        }
      }

      (req as Request & { permissions: typeof permissions }).permissions =
        permissions;
      next();
    } catch (error) {
      console.error("[Authorization] Error:", error);
      res.status(500).json({
        success: false,
        error: {
          code: "AUTHORIZATION_ERROR",
          message: "Failed to check authorization",
        },
      });
    }
  };
}

/**
 * Check any of the features (OR logic)
 * At least one feature must be allowed
 *
 * @param anyOfFeatures - Array of feature slugs
 * @param planId - Optional plan ID
 * @returns Express middleware function
 */
export function authorizeAny(anyOfFeatures: string[], planId?: number) {
  return async (
    req: Request,
    res: Response<ApiErrorResponse>,
    next: NextFunction
  ): Promise<void> => {
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

      const permissions = await permissionResolutionService.resolvePermissions(
        userId,
        orgId,
        planId
      );

      // Check if any feature is allowed
      let anyAllowed = false;
      for (const feature of anyOfFeatures) {
        const check = checkReason(permissions, feature);
        if (check.allowed) {
          anyAllowed = true;
          break;
        }
      }

      if (!anyAllowed) {
        if (isDevelopment) {
          console.log(
            `[Authorization] DENIED ANY: user=${userId} features=${anyOfFeatures.join(
              ","
            )}`
          );
        }

        res.status(403).json({
          success: false,
          error: {
            code: "FORBIDDEN",
            message: `None of the required features are available: ${anyOfFeatures.join(
              ", "
            )}`,
            details: { features: anyOfFeatures },
          },
        });
        return;
      }

      (req as Request & { permissions: typeof permissions }).permissions =
        permissions;
      next();
    } catch (error) {
      console.error("[Authorization] Error:", error);
      res.status(500).json({
        success: false,
        error: {
          code: "AUTHORIZATION_ERROR",
          message: "Failed to check authorization",
        },
      });
    }
  };
}
