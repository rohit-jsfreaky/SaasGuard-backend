import { Router, type Request, type Response } from "express";
import { roleService } from "../services/role.service.js";
import { rolePermissionService } from "../services/role-permission.service.js";
import { userRoleService } from "../services/user-role.service.js";
import {
  CreateRoleSchema,
  UpdateRoleSchema,
  GrantPermissionSchema,
  AssignRoleSchema,
} from "../validators/role.validator.js";
import { PaginationSchema } from "../validators/feature.validator.js";
import type { ApiResponse, ApiErrorResponse } from "../types/index.js";
import type { Role, RolePermission } from "../types/db.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = Router();

/**
 * Role list response type
 */
interface RoleListResponse {
  roles: Role[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

/**
 * Role with permissions response
 */
interface RoleWithPermissionsResponse extends Role {
  permissions: RolePermission[];
}

// =============================================================================
// ROLE CRUD ROUTES
// =============================================================================

/**
 * POST /admin/organizations/:orgId/roles
 * Create a new role in an organization
 */
router.post(
  "/organizations/:orgId/roles",
  requireAuth,
  async (
    req: Request,
    res: Response<ApiResponse<Role> | ApiErrorResponse>
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

      const parsed = CreateRoleSchema.safeParse({
        ...req.body,
        orgId: orgIdNum,
      });
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid input",
            details: parsed.error.flatten().fieldErrors,
          },
        });
        return;
      }

      const { name, slug, description } = parsed.data;
      const role = await roleService.createRole(
        orgIdNum,
        name,
        slug,
        description
      );

      res.status(201).json({
        success: true,
        data: role,
        message: "Role created successfully",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create role";

      if (message.includes("already exists")) {
        res.status(409).json({
          success: false,
          error: { code: "DUPLICATE_SLUG", message },
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: { code: "CREATE_FAILED", message },
      });
    }
  }
);

/**
 * GET /admin/organizations/:orgId/roles
 * List all roles in an organization
 */
router.get(
  "/organizations/:orgId/roles",
  async (
    req: Request,
    res: Response<ApiResponse<RoleListResponse> | ApiErrorResponse>
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

      const result = await roleService.getRolesByOrganization(orgIdNum, {
        limit,
        offset,
      });

      res.status(200).json({
        success: true,
        data: {
          roles: result.roles,
          pagination: {
            total: result.total,
            limit: result.limit,
            offset: result.offset,
            hasMore: result.offset + result.roles.length < result.total,
          },
        },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to list roles";
      res.status(500).json({
        success: false,
        error: { code: "LIST_FAILED", message },
      });
    }
  }
);

/**
 * GET /admin/roles/:id
 * Get a role by ID with permissions
 */
router.get(
  "/roles/:id",
  async (
    req: Request,
    res: Response<ApiResponse<RoleWithPermissionsResponse> | ApiErrorResponse>
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const roleId = parseInt(id ?? "", 10);
      if (isNaN(roleId)) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Invalid role ID" },
        });
        return;
      }

      const role = await roleService.getRoleById(roleId);
      if (!role) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: `Role not found: ${id}` },
        });
        return;
      }

      const permissions = await rolePermissionService.getRolePermissions(
        roleId
      );

      res.status(200).json({
        success: true,
        data: { ...role, permissions },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to get role";
      res.status(500).json({
        success: false,
        error: { code: "GET_FAILED", message },
      });
    }
  }
);

/**
 * PUT /admin/roles/:id
 * Update a role
 */
router.put(
  "/roles/:id",
  requireAuth,
  async (
    req: Request,
    res: Response<ApiResponse<Role> | ApiErrorResponse>
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const roleId = parseInt(id ?? "", 10);
      if (isNaN(roleId)) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Invalid role ID" },
        });
        return;
      }

      const parsed = UpdateRoleSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid input",
            details: parsed.error.flatten().fieldErrors,
          },
        });
        return;
      }

      const updates: { name?: string; description?: string | null } = {};
      if (parsed.data.name !== undefined) updates.name = parsed.data.name;
      if (parsed.data.description !== undefined)
        updates.description = parsed.data.description;

      const role = await roleService.updateRole(roleId, updates);

      res.status(200).json({
        success: true,
        data: role,
        message: "Role updated successfully",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update role";

      if (message.includes("not found")) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message },
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: { code: "UPDATE_FAILED", message },
      });
    }
  }
);

/**
 * DELETE /admin/roles/:id
 * Delete a role
 */
router.delete(
  "/roles/:id",
  requireAuth,
  async (
    req: Request,
    res: Response<ApiResponse<{ deleted: boolean }> | ApiErrorResponse>
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const roleId = parseInt(id ?? "", 10);
      if (isNaN(roleId)) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Invalid role ID" },
        });
        return;
      }

      await roleService.deleteRole(roleId);

      res.status(200).json({
        success: true,
        data: { deleted: true },
        message: "Role deleted successfully",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to delete role";

      if (message.includes("not found")) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message },
        });
        return;
      }

      if (message.includes("Cannot delete")) {
        res.status(409).json({
          success: false,
          error: { code: "ROLE_IN_USE", message },
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: { code: "DELETE_FAILED", message },
      });
    }
  }
);

// =============================================================================
// ROLE PERMISSION ROUTES
// =============================================================================

/**
 * POST /admin/roles/:id/permissions
 * Grant a permission to a role
 */
router.post(
  "/roles/:id/permissions",
  requireAuth,
  async (
    req: Request,
    res: Response<ApiResponse<{ granted: boolean }> | ApiErrorResponse>
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const roleId = parseInt(id ?? "", 10);
      if (isNaN(roleId)) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Invalid role ID" },
        });
        return;
      }

      const parsed = GrantPermissionSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid input",
            details: parsed.error.flatten().fieldErrors,
          },
        });
        return;
      }

      await rolePermissionService.grantPermissionToRole(
        roleId,
        parsed.data.featureSlug
      );

      res.status(201).json({
        success: true,
        data: { granted: true },
        message: "Permission granted successfully",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to grant permission";
      res.status(500).json({
        success: false,
        error: { code: "GRANT_FAILED", message },
      });
    }
  }
);

/**
 * GET /admin/roles/:id/permissions
 * Get all permissions for a role
 */
router.get(
  "/roles/:id/permissions",
  async (
    req: Request,
    res: Response<ApiResponse<RolePermission[]> | ApiErrorResponse>
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const roleId = parseInt(id ?? "", 10);
      if (isNaN(roleId)) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Invalid role ID" },
        });
        return;
      }

      const permissions = await rolePermissionService.getRolePermissions(
        roleId
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

/**
 * DELETE /admin/roles/:id/permissions/:featureSlug
 * Revoke a permission from a role
 */
router.delete(
  "/roles/:id/permissions/:featureSlug",
  requireAuth,
  async (
    req: Request,
    res: Response<ApiResponse<{ revoked: boolean }> | ApiErrorResponse>
  ): Promise<void> => {
    try {
      const { id, featureSlug } = req.params;
      const roleId = parseInt(id ?? "", 10);

      if (isNaN(roleId) || !featureSlug) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Invalid parameters" },
        });
        return;
      }

      await rolePermissionService.revokePermissionFromRole(roleId, featureSlug);

      res.status(200).json({
        success: true,
        data: { revoked: true },
        message: "Permission revoked successfully",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to revoke permission";

      if (message.includes("not found")) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message },
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: { code: "REVOKE_FAILED", message },
      });
    }
  }
);

// =============================================================================
// USER ROLE ROUTES
// =============================================================================

/**
 * POST /admin/users/:userId/roles
 * Assign a role to a user
 */
router.post(
  "/users/:userId/roles",
  requireAuth,
  async (
    req: Request,
    res: Response<ApiResponse<{ assigned: boolean }> | ApiErrorResponse>
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

      const parsed = AssignRoleSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid input",
            details: parsed.error.flatten().fieldErrors,
          },
        });
        return;
      }

      await userRoleService.assignRoleToUser(
        userIdNum,
        parsed.data.roleId,
        parsed.data.orgId
      );

      res.status(201).json({
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
 * GET /admin/users/:userId/roles
 * Get all roles for a user (requires orgId query param)
 */
router.get(
  "/users/:userId/roles",
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
            message: "Invalid user ID or organization ID",
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
 * GET /admin/users/:userId/permissions
 * Get all permissions for a user (requires orgId query param)
 */
router.get(
  "/users/:userId/permissions",
  async (
    req: Request,
    res: Response<ApiResponse<string[]> | ApiErrorResponse>
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
            message: "Invalid user ID or organization ID",
          },
        });
        return;
      }

      const permissions = await userRoleService.getUserRolePermissions(
        userIdNum,
        orgIdNum
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

/**
 * DELETE /admin/users/:userId/roles/:roleId
 * Remove a role from a user (requires orgId query param)
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

      res.status(200).json({
        success: true,
        data: { removed: true },
        message: "Role removed successfully",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to remove role";

      if (message.includes("not assigned")) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message },
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: { code: "REMOVE_FAILED", message },
      });
    }
  }
);

export default router;
