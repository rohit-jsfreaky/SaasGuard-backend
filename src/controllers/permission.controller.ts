import { Router, type Request, type Response } from "express";
import { permissionResolutionService } from "../services/permission-resolution.service.js";
import type { ApiResponse, ApiErrorResponse } from "../types/index.js";
import type {
  PermissionMap,
  PermissionCheckResult,
} from "../types/permissions.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = Router();

// =============================================================================
// USER PERMISSION ROUTES (for authenticated user)
// =============================================================================

/**
 * GET /me/permissions
 * Get resolved permissions for current authenticated user
 */
router.get(
  "/me/permissions",
  requireAuth,
  async (
    req: Request,
    res: Response<ApiResponse<PermissionMap> | ApiErrorResponse>
  ): Promise<void> => {
    try {
      const userId = req.user?.userId ? parseInt(req.user.userId, 10) : null;
      const orgId = req.user?.organizationId
        ? parseInt(req.user.organizationId, 10)
        : null;

      if (!userId || isNaN(userId)) {
        res.status(401).json({
          success: false,
          error: { code: "UNAUTHORIZED", message: "User ID not found" },
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

      // Get plan ID from query if provided
      const planIdParam = req.query["planId"];
      const planId =
        typeof planIdParam === "string" ? parseInt(planIdParam, 10) : undefined;

      const permissions = await permissionResolutionService.resolvePermissions(
        userId,
        orgId,
        !isNaN(planId ?? NaN) ? planId : undefined
      );

      res.status(200).json({
        success: true,
        data: permissions,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to resolve permissions";
      res.status(500).json({
        success: false,
        error: { code: "RESOLUTION_FAILED", message },
      });
    }
  }
);

/**
 * GET /me/permissions/check/:featureSlug
 * Check if current user has permission for a specific feature
 */
router.get(
  "/me/permissions/check/:featureSlug",
  requireAuth,
  async (
    req: Request,
    res: Response<ApiResponse<PermissionCheckResult> | ApiErrorResponse>
  ): Promise<void> => {
    try {
      const { featureSlug } = req.params;
      const userId = req.user?.userId ? parseInt(req.user.userId, 10) : null;
      const orgId = req.user?.organizationId
        ? parseInt(req.user.organizationId, 10)
        : null;

      if (!userId || isNaN(userId)) {
        res.status(401).json({
          success: false,
          error: { code: "UNAUTHORIZED", message: "User ID not found" },
        });
        return;
      }

      if (!orgId || isNaN(orgId) || !featureSlug) {
        res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Organization and feature required",
          },
        });
        return;
      }

      const result = await permissionResolutionService.checkPermission(
        userId,
        orgId,
        featureSlug
      );

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to check permission";
      res.status(500).json({
        success: false,
        error: { code: "CHECK_FAILED", message },
      });
    }
  }
);

// =============================================================================
// ADMIN PERMISSION ROUTES (for viewing other users' permissions)
// =============================================================================

/**
 * GET /admin/users/:userId/permissions
 * Get resolved permissions for any user (admin only)
 */
router.get(
  "/admin/users/:userId/permissions",
  requireAuth,
  async (
    req: Request,
    res: Response<ApiResponse<PermissionMap> | ApiErrorResponse>
  ): Promise<void> => {
    try {
      const { userId } = req.params;
      const { orgId, planId } = req.query;

      const userIdNum = parseInt(userId ?? "", 10);
      const orgIdNum = parseInt(orgId as string, 10);
      const planIdNum =
        typeof planId === "string" ? parseInt(planId, 10) : undefined;

      if (isNaN(userIdNum) || isNaN(orgIdNum)) {
        res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "User ID and Organization ID required",
          },
        });
        return;
      }

      const permissions = await permissionResolutionService.resolvePermissions(
        userIdNum,
        orgIdNum,
        !isNaN(planIdNum ?? NaN) ? planIdNum : undefined
      );

      res.status(200).json({
        success: true,
        data: permissions,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to resolve permissions";
      res.status(500).json({
        success: false,
        error: { code: "RESOLUTION_FAILED", message },
      });
    }
  }
);

/**
 * POST /admin/users/:userId/permissions/check
 * Check multiple permissions for a user (admin only)
 */
router.post(
  "/admin/users/:userId/permissions/check",
  requireAuth,
  async (
    req: Request,
    res: Response<
      ApiResponse<Record<string, PermissionCheckResult>> | ApiErrorResponse
    >
  ): Promise<void> => {
    try {
      const { userId } = req.params;
      const { orgId, featureSlugs, planId } = req.body as {
        orgId?: number;
        featureSlugs?: string[];
        planId?: number;
      };

      const userIdNum = parseInt(userId ?? "", 10);

      if (isNaN(userIdNum) || !orgId || !Array.isArray(featureSlugs)) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Invalid parameters" },
        });
        return;
      }

      const results =
        await permissionResolutionService.checkMultiplePermissions(
          userIdNum,
          orgId,
          featureSlugs,
          planId
        );

      res.status(200).json({
        success: true,
        data: results,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to check permissions";
      res.status(500).json({
        success: false,
        error: { code: "CHECK_FAILED", message },
      });
    }
  }
);

/**
 * POST /admin/users/:userId/permissions/invalidate
 * Invalidate cached permissions for a user (admin only)
 */
router.post(
  "/admin/users/:userId/permissions/invalidate",
  requireAuth,
  async (
    req: Request,
    res: Response<ApiResponse<{ invalidated: boolean }> | ApiErrorResponse>
  ): Promise<void> => {
    try {
      const { userId } = req.params;
      const { orgId } = req.body as { orgId?: number };

      const userIdNum = parseInt(userId ?? "", 10);

      if (isNaN(userIdNum)) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Invalid user ID" },
        });
        return;
      }

      if (orgId) {
        await permissionResolutionService.invalidatePermissions(
          userIdNum,
          orgId
        );
      } else {
        await permissionResolutionService.invalidateAllUserPermissions(
          userIdNum
        );
      }

      res.status(200).json({
        success: true,
        data: { invalidated: true },
        message: "Permissions cache invalidated",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to invalidate";
      res.status(500).json({
        success: false,
        error: { code: "INVALIDATE_FAILED", message },
      });
    }
  }
);

export default router;
