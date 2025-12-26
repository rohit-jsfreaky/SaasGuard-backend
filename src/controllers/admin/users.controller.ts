/**
 * Admin Users Controller
 * Pure controller functions for user management
 */

import type { Request, Response } from "express";
import { userService } from "../../services/user.service.js";
import { userRoleService } from "../../services/user-role.service.js";
import { usageService } from "../../services/usage.service.js";
import { overrideService } from "../../services/override.service.js";
import { permissionResolutionService } from "../../services/permission-resolution.service.js";
import { PaginationSchema } from "../../validators/feature.validator.js";
import type { ApiResponse } from "../../types/index.js";
import type { User, Role, Usage, Override } from "../../types/db.js";
import type { PermissionMap } from "../../types/permissions.js";
import { ValidationError, NotFoundError } from "../../utils/errors.js";
import { successResponse } from "../../utils/async-handler.js";
import { resolveOrganizationId } from "../../utils/organization.js";

/**
 * User with details response type
 */
export interface UserWithDetails extends User {
  roles?: Role[];
  usage?: Usage[];
  overrides?: Override[];
}

/**
 * User list response type
 */
export interface UserListResponse {
  users: User[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

/**
 * List all users in an organization
 */
export async function listUsers(
  req: Request,
  _res: Response
): Promise<ApiResponse<UserListResponse>> {
  const { orgId } = req.params;
  const orgIdNum = parseInt(orgId ?? "", 10);

  if (isNaN(orgIdNum)) {
    throw new ValidationError("Invalid organization ID");
  }

  const pagination = PaginationSchema.safeParse(req.query);
  const { limit, offset } = pagination.success
    ? pagination.data
    : { limit: 50, offset: 0 };

  const result = await userService.getUsersInOrganization(orgIdNum, {
    limit,
    offset,
  });

  return successResponse({
    users: result.users,
    pagination: {
      total: result.total,
      limit,
      offset,
      hasMore: offset + result.users.length < result.total,
    },
  }).response;
}

/**
 * Get detailed user info including roles, usage, and overrides
 */
export async function getUserDetails(
  req: Request,
  _res: Response
): Promise<ApiResponse<UserWithDetails>> {
  const { userId } = req.params;
  const trimmedUserId = userId?.trim();

  if (!trimmedUserId) {
    throw new ValidationError("Invalid user ID");
  }

  const orgId = await resolveOrganizationId(req.user?.organizationId);

  const user = await userService.getUserById(trimmedUserId);
  if (!user) {
    throw new NotFoundError("User", trimmedUserId);
  }

  // Load additional details
  const [roles, usage, overrides] = await Promise.all([
    orgId
      ? userRoleService.getUserRoles(trimmedUserId, orgId)
      : Promise.resolve([]),
    usageService.getUserUsage(trimmedUserId),
    overrideService.getActiveOverrides(trimmedUserId),
  ]);

  const userWithDetails: UserWithDetails = {
    ...user,
    roles,
    usage,
    overrides,
  };

  return successResponse(userWithDetails).response;
}

/**
 * List user's roles in an organization
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
    throw new ValidationError("User ID and Organization ID required");
  }

  const roles = await userRoleService.getUserRoles(trimmedUserId, orgIdNum);
  return successResponse(roles).response;
}

/**
 * Assign a role to a user
 */
export async function assignRoleToUser(
  req: Request,
  _res: Response
): Promise<ApiResponse<{ assigned: boolean }>> {
  const { userId, roleId } = req.params;
  const { orgId } = req.body as { orgId?: number };

  const trimmedUserId = userId?.trim();
  const roleIdNum = parseInt(roleId ?? "", 10);

  if (!trimmedUserId || isNaN(roleIdNum) || !orgId) {
    throw new ValidationError("Invalid parameters");
  }

  await userRoleService.assignRoleToUser(trimmedUserId, roleIdNum, orgId);

  // Invalidate user's permission cache
  await permissionResolutionService.invalidatePermissions(trimmedUserId, orgId);

  return successResponse({ assigned: true }, "Role assigned successfully").response;
}

/**
 * Remove a role from a user
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

  await userRoleService.removeRoleFromUser(trimmedUserId, roleIdNum, orgIdNum);

  // Invalidate user's permission cache
  await permissionResolutionService.invalidatePermissions(trimmedUserId, orgIdNum);

  return successResponse({ removed: true }, "Role removed successfully").response;
}

/**
 * Get user's usage data
 */
export async function getUserUsage(
  req: Request,
  _res: Response
): Promise<ApiResponse<Usage[]>> {
  const { userId } = req.params;
  const trimmedUserId = userId?.trim();

  if (!trimmedUserId) {
    throw new ValidationError("Invalid user ID");
  }

  const usage = await usageService.getUserUsage(trimmedUserId);
  return successResponse(usage).response;
}

/**
 * Get resolved permissions for a user
 */
export async function getUserPermissions(
  req: Request,
  _res: Response
): Promise<ApiResponse<PermissionMap>> {
  const { userId } = req.params;
  const { orgId, planId } = req.query;

  const trimmedUserId = userId?.trim();
  const orgIdNum = parseInt(orgId as string, 10);
  const planIdNum = typeof planId === "string" ? parseInt(planId, 10) : undefined;

  if (!trimmedUserId || isNaN(orgIdNum)) {
    throw new ValidationError("User ID and Organization ID required");
  }

  const permissions = await permissionResolutionService.resolvePermissions(
    trimmedUserId,
    orgIdNum,
    !isNaN(planIdNum ?? NaN) ? planIdNum : undefined
  );

  return successResponse(permissions).response;
}

