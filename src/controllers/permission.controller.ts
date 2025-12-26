/**
 * Permission Controller
 * Pure controller functions for permission management
 */

import type { Request, Response } from "express";
import { permissionResolutionService } from "../services/permission-resolution.service.js";
import type { ApiResponse } from "../types/index.js";
import type {
  PermissionMap,
  PermissionCheckResult,
} from "../types/permissions.js";
import { resolveOrganizationId } from "../utils/organization.js";
import { ValidationError, UnauthorizedError } from "../utils/errors.js";
import { successResponse } from "../utils/async-handler.js";

// =============================================================================
// USER PERMISSION CONTROLLERS (for authenticated user)
// =============================================================================

/**
 * Get resolved permissions for current authenticated user
 */
export async function getMyPermissions(
  req: Request,
  res: Response
): Promise<ApiResponse<PermissionMap>> {
  const userId = req.user?.userId ?? null;
  const orgIdentifier = req.user?.organizationId ?? null;

  if (!userId) {
    throw new UnauthorizedError("User ID not found");
  }

  const orgId = await resolveOrganizationId(orgIdentifier);

  if (!orgId) {
    throw new ValidationError("Organization context required");
  }

  const planIdParam = req.query["planId"];
  const planId =
    typeof planIdParam === "string" ? parseInt(planIdParam, 10) : undefined;

  const permissions = await permissionResolutionService.resolvePermissions(
    userId,
    orgId,
    !isNaN(planId ?? NaN) ? planId : undefined
  );

  return successResponse(permissions).response;
}

/**
 * Check if current user has permission for a specific feature
 */
export async function checkMyPermission(
  req: Request,
  res: Response
): Promise<ApiResponse<PermissionCheckResult>> {
  const { featureSlug } = req.params;
  const userId = req.user?.userId ?? null;
  const orgIdentifier = req.user?.organizationId ?? null;

  if (!userId) {
    throw new UnauthorizedError("User ID not found");
  }

  const orgId = await resolveOrganizationId(orgIdentifier);

  if (!orgId || !featureSlug) {
    throw new ValidationError("Organization and feature required");
  }

  const result = await permissionResolutionService.checkPermission(
    userId,
    orgId,
    featureSlug
  );

  return successResponse(result).response;
}

// =============================================================================
// ADMIN PERMISSION CONTROLLERS (for viewing other users' permissions)
// =============================================================================

/**
 * Get resolved permissions for any user (admin only)
 */
export async function getUserPermissions(
  req: Request,
  res: Response
): Promise<ApiResponse<PermissionMap>> {
  const { userId } = req.params;
  const { orgId, planId } = req.query;

  const trimmedUserId = userId?.trim();
  const orgIdNum = parseInt(orgId as string, 10);
  const planIdNum =
    typeof planId === "string" ? parseInt(planId, 10) : undefined;

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

/**
 * Check multiple permissions for a user (admin only)
 */
export async function checkUserPermissions(
  req: Request,
  res: Response
): Promise<ApiResponse<Record<string, PermissionCheckResult>>> {
  const { userId } = req.params;
  const { orgId, featureSlugs, planId } = req.body as {
    orgId?: number;
    featureSlugs?: string[];
    planId?: number;
  };

  const trimmedUserId = userId?.trim();

  if (!trimmedUserId || !orgId || !Array.isArray(featureSlugs)) {
    throw new ValidationError("Invalid parameters");
  }

  const results = await permissionResolutionService.checkMultiplePermissions(
    trimmedUserId,
    orgId,
    featureSlugs,
    planId
  );

  return successResponse(results).response;
}

/**
 * Invalidate cached permissions for a user (admin only)
 */
export async function invalidateUserPermissions(
  req: Request,
  res: Response
): Promise<ApiResponse<{ invalidated: boolean }>> {
  const { userId } = req.params;
  const { orgId } = req.body as { orgId?: number };

  const trimmedUserId = userId?.trim();

  if (!trimmedUserId) {
    throw new ValidationError("Invalid user ID");
  }

  if (orgId) {
    await permissionResolutionService.invalidatePermissions(trimmedUserId, orgId);
  } else {
    await permissionResolutionService.invalidateAllUserPermissions(trimmedUserId);
  }

  return successResponse({ invalidated: true }, "Permissions cache invalidated").response;
}
