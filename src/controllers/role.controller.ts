/**
 * Role Controller
 * Pure controller functions for role management
 */

import type { Request, Response } from "express";
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
import type { ApiResponse } from "../types/index.js";
import type { Role, RolePermission } from "../types/db.js";
import { ValidationError, NotFoundError, ConflictError } from "../utils/errors.js";
import { successResponse } from "../utils/async-handler.js";

/**
 * Role list response type
 */
export interface RoleListResponse {
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
export interface RoleWithPermissionsResponse extends Role {
  permissions: RolePermission[];
}

// =============================================================================
// ROLE CRUD CONTROLLERS
// =============================================================================

/**
 * Create a new role in an organization
 */
export async function createRole(
  req: Request,
  res: Response
): Promise<ApiResponse<Role>> {
  const { orgId } = req.params;
  const orgIdNum = parseInt(orgId ?? "", 10);
  if (isNaN(orgIdNum)) {
    throw new ValidationError("Invalid organization ID");
  }

  const parsed = CreateRoleSchema.safeParse({
    ...req.body,
    orgId: orgIdNum,
  });
  if (!parsed.success) {
    throw new ValidationError("Invalid input", parsed.error.flatten().fieldErrors);
  }

  const { name, slug, description } = parsed.data;

  try {
    const role = await roleService.createRole(orgIdNum, name, slug, description);
    res.statusCode = 201;
    return successResponse(role, "Role created successfully", 201).response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create role";
    if (message.includes("already exists")) {
      throw new ConflictError(message);
    }
    throw error;
  }
}

/**
 * List all roles in an organization
 */
export async function listRoles(
  req: Request,
  _res: Response
): Promise<ApiResponse<RoleListResponse>> {
  const { orgId } = req.params;
  const orgIdNum = parseInt(orgId ?? "", 10);
  if (isNaN(orgIdNum)) {
    throw new ValidationError("Invalid organization ID");
  }

  const pagination = PaginationSchema.safeParse(req.query);
  const { limit, offset } = pagination.success
    ? pagination.data
    : { limit: 50, offset: 0 };

  const result = await roleService.getRolesByOrganization(orgIdNum, {
    limit,
    offset,
  });

  return successResponse({
    roles: result.roles,
    pagination: {
      total: result.total,
      limit: result.limit,
      offset: result.offset,
      hasMore: result.offset + result.roles.length < result.total,
    },
  }).response;
}

/**
 * Get a role by ID with permissions
 */
export async function getRole(
  req: Request,
  _res: Response
): Promise<ApiResponse<RoleWithPermissionsResponse>> {
  const { id } = req.params;
  const roleId = parseInt(id ?? "", 10);
  if (isNaN(roleId)) {
    throw new ValidationError("Invalid role ID");
  }

  const role = await roleService.getRoleById(roleId);
  if (!role) {
    throw new NotFoundError("Role", roleId);
  }

  const permissions = await rolePermissionService.getRolePermissions(roleId);

  return successResponse({ ...role, permissions }).response;
}

/**
 * Update a role
 */
export async function updateRole(
  req: Request,
  _res: Response
): Promise<ApiResponse<Role>> {
  const { id } = req.params;
  const roleId = parseInt(id ?? "", 10);
  if (isNaN(roleId)) {
    throw new ValidationError("Invalid role ID");
  }

  const parsed = UpdateRoleSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError("Invalid input", parsed.error.flatten().fieldErrors);
  }

  const updates: { name?: string; description?: string | null } = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;

  try {
    const role = await roleService.updateRole(roleId, updates);
    return successResponse(role, "Role updated successfully").response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update role";
    if (message.includes("not found")) {
      throw new NotFoundError("Role", roleId);
    }
    throw error;
  }
}

/**
 * Delete a role
 */
export async function deleteRole(
  req: Request,
  _res: Response
): Promise<ApiResponse<{ deleted: boolean }>> {
  const { id } = req.params;
  const roleId = parseInt(id ?? "", 10);
  if (isNaN(roleId)) {
    throw new ValidationError("Invalid role ID");
  }

  try {
    await roleService.deleteRole(roleId);
    return successResponse({ deleted: true }, "Role deleted successfully").response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete role";

    if (message.includes("not found")) {
      throw new NotFoundError("Role", roleId);
    }

    if (message.includes("Cannot delete")) {
      throw new ConflictError(message);
    }

    throw error;
  }
}

// =============================================================================
// ROLE PERMISSION CONTROLLERS
// =============================================================================

/**
 * Grant a permission to a role
 */
export async function grantPermissionToRole(
  req: Request,
  res: Response
): Promise<ApiResponse<{ granted: boolean }>> {
  const { id } = req.params;
  const roleId = parseInt(id ?? "", 10);
  if (isNaN(roleId)) {
    throw new ValidationError("Invalid role ID");
  }

  const parsed = GrantPermissionSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError("Invalid input", parsed.error.flatten().fieldErrors);
  }

  await rolePermissionService.grantPermissionToRole(roleId, parsed.data.featureSlug);

  res.statusCode = 201;
  return successResponse(
    { granted: true },
    "Permission granted successfully",
    201
  ).response;
}

/**
 * Get all permissions for a role
 */
export async function getRolePermissions(
  req: Request,
  _res: Response
): Promise<ApiResponse<RolePermission[]>> {
  const { id } = req.params;
  const roleId = parseInt(id ?? "", 10);
  if (isNaN(roleId)) {
    throw new ValidationError("Invalid role ID");
  }

  const permissions = await rolePermissionService.getRolePermissions(roleId);
  return successResponse(permissions).response;
}

/**
 * Revoke a permission from a role
 */
export async function revokePermissionFromRole(
  req: Request,
  _res: Response
): Promise<ApiResponse<{ revoked: boolean }>> {
  const { id, featureSlug } = req.params;
  const roleId = parseInt(id ?? "", 10);

  if (isNaN(roleId) || !featureSlug) {
    throw new ValidationError("Invalid parameters");
  }

  try {
    await rolePermissionService.revokePermissionFromRole(roleId, featureSlug);
    return successResponse({ revoked: true }, "Permission revoked successfully").response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to revoke permission";
    if (message.includes("not found")) {
      throw new NotFoundError("Permission");
    }
    throw error;
  }
}

// =============================================================================
// USER ROLE CONTROLLERS
// =============================================================================

/**
 * Assign a role to a user
 */
export async function assignRoleToUser(
  req: Request,
  res: Response
): Promise<ApiResponse<{ assigned: boolean }>> {
  const { userId } = req.params;
  const trimmedUserId = userId?.trim();
  if (!trimmedUserId) {
    throw new ValidationError("Invalid user ID");
  }

  const parsed = AssignRoleSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError("Invalid input", parsed.error.flatten().fieldErrors);
  }

  await userRoleService.assignRoleToUser(
    trimmedUserId,
    parsed.data.roleId,
    parsed.data.orgId
  );

  res.statusCode = 201;
  return successResponse(
    { assigned: true },
    "Role assigned successfully",
    201
  ).response;
}

/**
 * Get all roles for a user (requires orgId query param)
 */
export async function getUserRoles(
  req: Request,
  _res: Response
): Promise<ApiResponse<Role[]>> {
  const { userId } = req.params;
  const { orgId } = req.query;

  const trimmedUserId = userId?.trim();
  const orgIdNum = parseInt(orgId as string, 10);

  if (!trimmedUserId || isNaN(orgIdNum)) {
    throw new ValidationError("Invalid user ID or organization ID");
  }

  const roles = await userRoleService.getUserRoles(trimmedUserId, orgIdNum);
  return successResponse(roles).response;
}

/**
 * Get all permissions for a user (requires orgId query param)
 */
export async function getUserRolePermissions(
  req: Request,
  _res: Response
): Promise<ApiResponse<string[]>> {
  const { userId } = req.params;
  const { orgId } = req.query;

  const trimmedUserId = userId?.trim();
  const orgIdNum = parseInt(orgId as string, 10);

  if (!trimmedUserId || isNaN(orgIdNum)) {
    throw new ValidationError("Invalid user ID or organization ID");
  }

  const permissions = await userRoleService.getUserRolePermissions(
    trimmedUserId,
    orgIdNum
  );
  return successResponse(permissions).response;
}

/**
 * Remove a role from a user (requires orgId query param)
 */
export async function removeRoleFromUser(
  req: Request,
  _res: Response
): Promise<ApiResponse<{ removed: boolean }>> {
  const { userId, roleId } = req.params;
  const { orgId } = req.query;

  const trimmedUserId = userId?.trim();
  const roleIdNum = parseInt(roleId ?? "", 10);
  const orgIdNum = parseInt(orgId as string, 10);

  if (!trimmedUserId || isNaN(roleIdNum) || isNaN(orgIdNum)) {
    throw new ValidationError("Invalid parameters");
  }

  try {
    await userRoleService.removeRoleFromUser(trimmedUserId, roleIdNum, orgIdNum);
    return successResponse({ removed: true }, "Role removed successfully").response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to remove role";
    if (message.includes("not assigned")) {
      throw new NotFoundError("User role");
    }
    throw error;
  }
}
