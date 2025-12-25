/**
 * Admin Users Routes
 * Endpoints for managing users within an organization
 */

import { Router, type Request, type Response } from "express";
import { userService } from "../../services/user.service.js";
import { userRoleService } from "../../services/user-role.service.js";
import { usageService } from "../../services/usage.service.js";
import { overrideService } from "../../services/override.service.js";
import { permissionResolutionService } from "../../services/permission-resolution.service.js";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { requireOrgAdmin } from "../../middleware/admin-check.middleware.js";
import { PaginationSchema } from "../../validators/feature.validator.js";
import type { ApiResponse, ApiErrorResponse } from "../../types/index.js";
import type { User, Role, Usage, Override } from "../../types/db.js";
import type { PermissionMap } from "../../types/permissions.js";

const router = Router();

/**
 * User with details response type
 */
interface UserWithDetails extends User {
  roles?: Role[];
  usage?: Usage[];
  overrides?: Override[];
}

/**
 * User list response type
 */
interface UserListResponse {
  users: User[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

// ============================================================================
// USER LIST & DETAILS
// ============================================================================

/**
 * GET /admin/organizations/:orgId/users
 * List all users in an organization
 */
router.get(
  "/organizations/:orgId/users",
  requireAuth,
  requireOrgAdmin,
  async (
    req: Request,
    res: Response<ApiResponse<UserListResponse> | ApiErrorResponse>
  ): Promise<void> => {
    try {
      const { orgId } = req.params;
      const orgIdNum = parseInt(orgId ?? "", 10);

      if (isNaN(orgIdNum)) {
        res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid organization ID",
          },
        });
        return;
      }

      const pagination = PaginationSchema.safeParse(req.query);
      const { limit, offset } = pagination.success
        ? pagination.data
        : { limit: 50, offset: 0 };

      const result = await userService.getUsersInOrganization(orgIdNum, {
        limit,
        offset,
      });

      res.status(200).json({
        success: true,
        data: {
          users: result.users,
          pagination: {
            total: result.total,
            limit,
            offset,
            hasMore: offset + result.users.length < result.total,
          },
        },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to list users";
      res.status(500).json({
        success: false,
        error: { code: "LIST_FAILED", message },
      });
    }
  }
);

/**
 * GET /admin/users/:userId
 * Get detailed user info including roles, usage, and overrides
 */
router.get(
  "/users/:userId",
  requireAuth,
  async (
    req: Request,
    res: Response<ApiResponse<UserWithDetails> | ApiErrorResponse>
  ): Promise<void> => {
    try {
      const { userId } = req.params;
      const userIdNum = parseInt(userId ?? "", 10);
      const orgIdNum = req.user?.organizationId
        ? parseInt(req.user.organizationId, 10)
        : null;

      if (isNaN(userIdNum)) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Invalid user ID" },
        });
        return;
      }

      const user = await userService.getUserById(userIdNum);
      if (!user) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: `User not found: ${userId}` },
        });
        return;
      }

      // Load additional details
      const [roles, usage, overrides] = await Promise.all([
        orgIdNum
          ? userRoleService.getUserRoles(userIdNum, orgIdNum)
          : Promise.resolve([]),
        usageService.getUserUsage(userIdNum),
        overrideService.getActiveOverrides(userIdNum),
      ]);

      const userWithDetails: UserWithDetails = {
        ...user,
        roles,
        usage,
        overrides,
      };

      res.status(200).json({
        success: true,
        data: userWithDetails,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to get user";
      res.status(500).json({
        success: false,
        error: { code: "GET_FAILED", message },
      });
    }
  }
);

// ============================================================================
// USER ROLES MANAGEMENT
// ============================================================================

/**
 * GET /admin/users/:userId/roles
 * List user's roles in an organization
 */
router.get(
  "/users/:userId/roles",
  requireAuth,
  async (
    req: Request,
    res: Response<ApiResponse<Role[]> | ApiErrorResponse>
  ): Promise<void> => {
    try {
      const { userId } = req.params;
      const { orgId } = req.query;

      const userIdNum = parseInt(userId ?? "", 10);
      const orgIdNum = parseInt(orgId as string, 10);

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

      const roles = await userRoleService.getUserRoles(userIdNum, orgIdNum);

      res.status(200).json({
        success: true,
        data: roles,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to get roles";
      res.status(500).json({
        success: false,
        error: { code: "GET_ROLES_FAILED", message },
      });
    }
  }
);

/**
 * POST /admin/users/:userId/roles/:roleId
 * Assign a role to a user
 */
router.post(
  "/users/:userId/roles/:roleId",
  requireAuth,
  async (
    req: Request,
    res: Response<ApiResponse<{ assigned: boolean }> | ApiErrorResponse>
  ): Promise<void> => {
    try {
      const { userId, roleId } = req.params;
      const { orgId } = req.body as { orgId?: number };

      const userIdNum = parseInt(userId ?? "", 10);
      const roleIdNum = parseInt(roleId ?? "", 10);

      if (isNaN(userIdNum) || isNaN(roleIdNum) || !orgId) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Invalid parameters" },
        });
        return;
      }

      await userRoleService.assignRoleToUser(userIdNum, roleIdNum, orgId);

      // Invalidate user's permission cache
      await permissionResolutionService.invalidatePermissions(userIdNum, orgId);

      res.status(200).json({
        success: true,
        data: { assigned: true },
        message: "Role assigned successfully",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to assign role";
      res.status(500).json({
        success: false,
        error: { code: "ASSIGN_FAILED", message },
      });
    }
  }
);

/**
 * DELETE /admin/users/:userId/roles/:roleId
 * Remove a role from a user
 */
router.delete(
  "/users/:userId/roles/:roleId",
  requireAuth,
  async (
    req: Request,
    res: Response<ApiResponse<{ removed: boolean }> | ApiErrorResponse>
  ): Promise<void> => {
    try {
      const { userId, roleId } = req.params;
      const { orgId } = req.query;

      const userIdNum = parseInt(userId ?? "", 10);
      const roleIdNum = parseInt(roleId ?? "", 10);
      const orgIdNum = parseInt(orgId as string, 10);

      if (isNaN(userIdNum) || isNaN(roleIdNum) || isNaN(orgIdNum)) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Invalid parameters" },
        });
        return;
      }

      await userRoleService.removeRoleFromUser(userIdNum, roleIdNum, orgIdNum);

      // Invalidate user's permission cache
      await permissionResolutionService.invalidatePermissions(
        userIdNum,
        orgIdNum
      );

      res.status(200).json({
        success: true,
        data: { removed: true },
        message: "Role removed successfully",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to remove role";
      res.status(500).json({
        success: false,
        error: { code: "REMOVE_FAILED", message },
      });
    }
  }
);

// ============================================================================
// USER USAGE & PERMISSIONS
// ============================================================================

/**
 * GET /admin/users/:userId/usage
 * Get user's usage data
 */
router.get(
  "/users/:userId/usage",
  requireAuth,
  async (
    req: Request,
    res: Response<ApiResponse<Usage[]> | ApiErrorResponse>
  ): Promise<void> => {
    try {
      const { userId } = req.params;
      const userIdNum = parseInt(userId ?? "", 10);

      if (isNaN(userIdNum)) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Invalid user ID" },
        });
        return;
      }

      const usage = await usageService.getUserUsage(userIdNum);

      res.status(200).json({
        success: true,
        data: usage,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to get usage";
      res.status(500).json({
        success: false,
        error: { code: "GET_USAGE_FAILED", message },
      });
    }
  }
);

/**
 * GET /admin/users/:userId/permissions
 * Get resolved permissions for a user
 */
router.get(
  "/users/:userId/permissions",
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
        error instanceof Error ? error.message : "Failed to get permissions";
      res.status(500).json({
        success: false,
        error: { code: "GET_PERMISSIONS_FAILED", message },
      });
    }
  }
);

export default router;
