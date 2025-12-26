/**
 * Rate Limit Middleware
 * Enforces usage limits on API routes
 *
 * Records usage AFTER the action succeeds (in response handler)
 * Checks limit BEFORE the action starts (in middleware)
 */

import type { Request, Response, NextFunction } from "express";
import { permissionResolutionService } from "../services/permission-resolution.service.js";
import { usageService } from "../services/usage.service.js";
import { limit as getLimit, can } from "../utils/permission-check.js";
import type { ApiErrorResponse } from "../types/index.js";
import type { PermissionMap } from "../types/permissions.js";
import { isDevelopment } from "../config/environment.js";
import { resolveOrganizationId } from "../utils/organization.js";

/**
 * Extended request with permissions attached
 */
interface AuthorizedRequest extends Request {
  permissions?: PermissionMap;
}

/**
 * Rate limit middleware factory
 * Checks if user is within usage limits before proceeding
 *
 * @param featureName - Feature slug to check limits for
 * @param customLimit - Optional custom limit to use instead of plan limit
 * @returns Express middleware function
 *
 * Usage:
 * router.post('/api/calls', enforceLimit('api_calls'), handler)
 */
export function enforceLimit(featureName: string, customLimit?: number) {
  return async (
    req: Request,
    res: Response<ApiErrorResponse>,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = req.user?.userId ?? null;
      const orgId = await resolveOrganizationId(req.user?.organizationId);

      if (!userId) {
        res.status(401).json({
          success: false,
          error: { code: "UNAUTHORIZED", message: "Authentication required" },
        });
        return;
      }

      if (!orgId) {
        res.status(400).json({
          success: false,
          error: {
            code: "NO_ORGANIZATION",
            message: "Organization context required",
          },
        });
        return;
      }

      // Get permissions (may be attached by authorize middleware)
      let permissions = (req as AuthorizedRequest).permissions;

      if (!permissions) {
        permissions = await permissionResolutionService.resolvePermissions(
          userId,
          orgId
        );
        (req as AuthorizedRequest).permissions = permissions;
      }

      // Get limit info
      const limitInfo = getLimit(permissions, featureName);

      // Check custom limit or permission limit
      if (customLimit !== undefined) {
        // Use custom limit
        const currentUsage = await usageService.getUsageCount(
          userId,
          featureName
        );
        if (currentUsage >= customLimit) {
          if (isDevelopment) {
            console.log(
              `[RateLimit] EXCEEDED: user=${userId} feature=${featureName} usage=${currentUsage}/${customLimit}`
            );
          }

          res.status(429).json({
            success: false,
            error: {
              code: "LIMIT_EXCEEDED",
              message: `You've reached your usage limit for "${featureName}" this month`,
              details: {
                feature: featureName,
                limit: {
                  max: customLimit,
                  used: currentUsage,
                  remaining: 0,
                  exceeded: true,
                },
              },
            },
          });
          return;
        }
      } else if (limitInfo && limitInfo.exceeded) {
        // Use plan limit
        if (isDevelopment) {
          console.log(
            `[RateLimit] EXCEEDED: user=${userId} feature=${featureName} usage=${limitInfo.used}/${limitInfo.max}`
          );
        }

        res.status(429).json({
          success: false,
          error: {
            code: "LIMIT_EXCEEDED",
            message: `You've reached your usage limit for "${featureName}" this month`,
            details: {
              feature: featureName,
              limit: limitInfo,
            },
          },
        });
        return;
      }

      if (isDevelopment && limitInfo) {
        console.log(
          `[RateLimit] ALLOWED: user=${userId} feature=${featureName} usage=${limitInfo.used}/${limitInfo.max}`
        );
      }

      next();
    } catch (error) {
      console.error("[RateLimit] Error:", error);
      res.status(500).json({
        success: false,
        error: {
          code: "RATE_LIMIT_ERROR",
          message: "Failed to check rate limit",
        },
      });
    }
  };
}

/**
 * Record usage after successful action
 * Call this AFTER the action completes successfully
 *
 * @param featureName - Feature slug to record usage for
 * @param amount - Amount to increment (default: 1)
 * @returns Express middleware function
 *
 * Usage: Use as a helper in your route handlers
 * await recordUsage(req, 'create_post');
 */
export async function recordUsage(
  req: Request,
  featureName: string,
  amount: number = 1
): Promise<void> {
  const userId = req.user?.userId ?? null;

  if (!userId) {
    throw new Error("User ID required to record usage");
  }

  await usageService.recordUsage(userId, featureName, amount);

  if (isDevelopment) {
    console.log(
      `[RateLimit] Recorded: user=${userId} feature=${featureName} amount=${amount}`
    );
  }
}

/**
 * Combined authorization and rate limit check
 * Checks both feature permission AND usage limit
 *
 * @param featureName - Feature slug to check
 * @param planId - Optional plan ID
 * @returns Express middleware function
 *
 * Usage:
 * router.post('/posts', authorizeAndLimit('create_post'), handler)
 */
export function authorizeAndLimit(featureName: string, planId?: number) {
  return async (
    req: Request,
    res: Response<ApiErrorResponse>,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = req.user?.userId ?? null;
      const orgId = await resolveOrganizationId(req.user?.organizationId);

      if (!userId) {
        res.status(401).json({
          success: false,
          error: { code: "UNAUTHORIZED", message: "Authentication required" },
        });
        return;
      }

      if (!orgId) {
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

      // Check feature permission
      if (!can(permissions, featureName)) {
        if (isDevelopment) {
          console.log(
            `[AuthAndLimit] DENIED: user=${userId} feature=${featureName} reason=FEATURE_DENIED`
          );
        }

        res.status(403).json({
          success: false,
          error: {
            code: "FORBIDDEN",
            message: `Feature "${featureName}" is not available in your plan`,
            details: { feature: featureName },
          },
        });
        return;
      }

      // Check limit
      const limitInfo = getLimit(permissions, featureName);
      if (limitInfo && limitInfo.exceeded) {
        if (isDevelopment) {
          console.log(
            `[AuthAndLimit] DENIED: user=${userId} feature=${featureName} reason=LIMIT_EXCEEDED`
          );
        }

        res.status(429).json({
          success: false,
          error: {
            code: "LIMIT_EXCEEDED",
            message: `You've reached your usage limit for "${featureName}" this month`,
            details: { feature: featureName, limit: limitInfo },
          },
        });
        return;
      }

      (req as AuthorizedRequest).permissions = permissions;

      if (isDevelopment) {
        console.log(
          `[AuthAndLimit] ALLOWED: user=${userId} feature=${featureName}`
        );
      }

      next();
    } catch (error) {
      console.error("[AuthAndLimit] Error:", error);
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
