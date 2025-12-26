/**
 * Override Controller
 * Pure controller functions for override management
 */

import type { Request, Response } from "express";
import { overrideService } from "../services/override.service.js";
import { organizationOverrideService } from "../services/organization-override.service.js";
import {
  CreateOverrideSchema,
  UpdateOverrideSchema,
} from "../validators/override.validator.js";
import { PaginationSchema } from "../validators/feature.validator.js";
import type { ApiResponse } from "../types/index.js";
import type { Override, OrganizationOverride } from "../types/db.js";
import { ValidationError, NotFoundError } from "../utils/errors.js";
import { successResponse } from "../utils/async-handler.js";

/**
 * Override list response type
 */
export interface OverrideListResponse {
  overrides: Override[];
  total: number;
}

// =============================================================================
// USER OVERRIDE CONTROLLERS
// =============================================================================

/**
 * Create a new user override
 */
export async function createOverride(
  req: Request,
  res: Response
): Promise<ApiResponse<Override>> {
  const parsed = CreateOverrideSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError("Invalid input", parsed.error.flatten().fieldErrors);
  }

  const { userId, featureSlug, overrideType, value, expiresAt } = parsed.data;
  const createdBy = req.user?.userId;

  const override = await overrideService.createOverride(
    userId,
    featureSlug,
    overrideType,
    value,
    expiresAt,
    createdBy
  );

  res.statusCode = 201;
  return successResponse(override, "Override created successfully", 201).response;
}

/**
 * List overrides (optionally filter by featureSlug)
 */
export async function listOverrides(
  req: Request,
  res: Response
): Promise<ApiResponse<OverrideListResponse>> {
  const { featureSlug } = req.query;
  const pagination = PaginationSchema.safeParse(req.query);
  const { limit } = pagination.success ? pagination.data : { limit: 50 };

  if (typeof featureSlug === "string" && featureSlug.length > 0) {
    const overrides = await overrideService.listOverridesForFeature(featureSlug, limit);
    return successResponse({ overrides, total: overrides.length }).response;
  }

  throw new ValidationError("Please provide featureSlug query parameter");
}

/**
 * Get all overrides for a user
 */
export async function getUserOverrides(
  req: Request,
  res: Response
): Promise<ApiResponse<OverrideListResponse>> {
  const { userId } = req.params;
  if (!userId) {
    throw new ValidationError("Invalid user ID");
  }

  const { active } = req.query;

  let overrides: Override[];
  if (active === "true") {
    overrides = await overrideService.getActiveOverrides(userId);
  } else {
    overrides = await overrideService.getAllUserOverrides(userId);
  }

  return successResponse({ overrides, total: overrides.length }).response;
}

/**
 * Get a specific override
 */
export async function getOverride(
  req: Request,
  res: Response
): Promise<ApiResponse<Override>> {
  const { id } = req.params;
  const overrideId = parseInt(id ?? "", 10);
  if (isNaN(overrideId)) {
    throw new ValidationError("Invalid override ID");
  }

  const override = await overrideService.getOverrideById(overrideId);
  if (!override) {
    throw new NotFoundError("Override", overrideId);
  }

  return successResponse(override).response;
}

/**
 * Update an override
 */
export async function updateOverride(
  req: Request,
  res: Response
): Promise<ApiResponse<Override>> {
  const { id } = req.params;
  const overrideId = parseInt(id ?? "", 10);
  if (isNaN(overrideId)) {
    throw new ValidationError("Invalid override ID");
  }

  const parsed = UpdateOverrideSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError("Invalid input", parsed.error.flatten().fieldErrors);
  }

  const updates: { value?: string | null; expiresAt?: Date | null } = {};
  if (parsed.data.value !== undefined) updates.value = parsed.data.value;
  if (parsed.data.expiresAt !== undefined) updates.expiresAt = parsed.data.expiresAt;

  try {
    const override = await overrideService.updateOverride(overrideId, updates);
    return successResponse(override, "Override updated successfully").response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update override";
    if (message.includes("not found")) {
      throw new NotFoundError("Override", overrideId);
    }
    throw error;
  }
}

/**
 * Delete an override
 */
export async function deleteOverride(
  req: Request,
  res: Response
): Promise<ApiResponse<{ deleted: boolean }>> {
  const { id } = req.params;
  const overrideId = parseInt(id ?? "", 10);
  if (isNaN(overrideId)) {
    throw new ValidationError("Invalid override ID");
  }

  try {
    await overrideService.deleteOverride(overrideId);
    return successResponse({ deleted: true }, "Override deleted successfully").response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete override";
    if (message.includes("not found")) {
      throw new NotFoundError("Override", overrideId);
    }
    throw error;
  }
}

/**
 * Expire an override immediately
 */
export async function expireOverride(
  req: Request,
  res: Response
): Promise<ApiResponse<{ expired: boolean }>> {
  const { id } = req.params;
  const overrideId = parseInt(id ?? "", 10);
  if (isNaN(overrideId)) {
    throw new ValidationError("Invalid override ID");
  }

  try {
    await overrideService.expireOverride(overrideId);
    return successResponse({ expired: true }, "Override expired successfully").response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to expire override";
    if (message.includes("not found")) {
      throw new NotFoundError("Override", overrideId);
    }
    throw error;
  }
}

/**
 * Get override for a specific user and feature
 */
export async function getOverrideForFeature(
  req: Request,
  res: Response
): Promise<ApiResponse<Override | null>> {
  const { userId, featureSlug } = req.params;

  if (!userId || !featureSlug) {
    throw new ValidationError("Invalid parameters");
  }

  const override = await overrideService.getOverrideForFeature(userId, featureSlug);
  return successResponse(override).response;
}

// =============================================================================
// ORGANIZATION OVERRIDE CONTROLLERS
// =============================================================================

/**
 * Create a new organization override
 */
export async function createOrganizationOverride(
  req: Request,
  res: Response
): Promise<ApiResponse<OrganizationOverride>> {
  const { orgId } = req.params;
  const orgIdNum = parseInt(orgId ?? "", 10);

  if (isNaN(orgIdNum)) {
    throw new ValidationError("Invalid organization ID");
  }

  const parsed = CreateOverrideSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError("Invalid input", parsed.error.flatten().fieldErrors);
  }

  const { featureSlug, overrideType, value, expiresAt } = parsed.data;
  const createdBy = req.user?.userId;

  const override = await organizationOverrideService.createOrganizationOverride(
    orgIdNum,
    featureSlug,
    overrideType,
    value,
    expiresAt,
    createdBy
  );

  res.statusCode = 201;
  return successResponse(
    override,
    "Organization override created successfully",
    201
  ).response;
}

/**
 * Get all overrides for an organization
 */
export async function getOrganizationOverrides(
  req: Request,
  res: Response
): Promise<ApiResponse<OrganizationOverride[]>> {
  const { orgId } = req.params;
  const orgIdNum = parseInt(orgId ?? "", 10);

  if (isNaN(orgIdNum)) {
    throw new ValidationError("Invalid organization ID");
  }

  const { active } = req.query;
  const { limit } = PaginationSchema.safeParse(req.query).success
    ? PaginationSchema.parse(req.query)
    : { limit: 50 };

  let overrides: OrganizationOverride[];
  if (active === "true") {
    overrides = await organizationOverrideService.getActiveOrganizationOverrides(orgIdNum);
  } else {
    overrides = await organizationOverrideService.listOrganizationOverrides(orgIdNum, limit);
  }

  return successResponse(overrides).response;
}

/**
 * Get a specific organization override
 */
export async function getOrganizationOverride(
  req: Request,
  res: Response
): Promise<ApiResponse<OrganizationOverride>> {
  const { id } = req.params;
  const overrideId = parseInt(id ?? "", 10);

  if (isNaN(overrideId)) {
    throw new ValidationError("Invalid override ID");
  }

  const override = await organizationOverrideService.getOrganizationOverrideById(overrideId);

  if (!override) {
    throw new NotFoundError("Override", overrideId);
  }

  return successResponse(override).response;
}

/**
 * Update an organization override
 */
export async function updateOrganizationOverride(
  req: Request,
  res: Response
): Promise<ApiResponse<OrganizationOverride>> {
  const { id } = req.params;
  const overrideId = parseInt(id ?? "", 10);

  if (isNaN(overrideId)) {
    throw new ValidationError("Invalid override ID");
  }

  const parsed = UpdateOverrideSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError("Invalid input", parsed.error.flatten().fieldErrors);
  }

  const updates: { value?: string | null; expiresAt?: Date | null } = {};
  if (parsed.data.value !== undefined) updates.value = parsed.data.value;
  if (parsed.data.expiresAt !== undefined) updates.expiresAt = parsed.data.expiresAt;

  try {
    const override = await organizationOverrideService.updateOrganizationOverride(
      overrideId,
      updates
    );
    return successResponse(
      override,
      "Organization override updated successfully"
    ).response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update override";
    if (message.includes("not found")) {
      throw new NotFoundError("Override", overrideId);
    }
    throw error;
  }
}

/**
 * Delete an organization override
 */
export async function deleteOrganizationOverride(
  req: Request,
  res: Response
): Promise<ApiResponse<{ deleted: boolean }>> {
  const { id } = req.params;
  const overrideId = parseInt(id ?? "", 10);

  if (isNaN(overrideId)) {
    throw new ValidationError("Invalid override ID");
  }

  try {
    await organizationOverrideService.deleteOrganizationOverride(overrideId);
    return successResponse(
      { deleted: true },
      "Organization override deleted successfully"
    ).response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete override";
    if (message.includes("not found")) {
      throw new NotFoundError("Override", overrideId);
    }
    throw error;
  }
}

/**
 * Get override for a specific organization and feature
 */
export async function getOrganizationOverrideForFeature(
  req: Request,
  res: Response
): Promise<ApiResponse<OrganizationOverride | null>> {
  const { orgId, featureSlug } = req.params;
  const orgIdNum = parseInt(orgId ?? "", 10);

  if (isNaN(orgIdNum) || !featureSlug) {
    throw new ValidationError("Invalid parameters");
  }

  const override = await organizationOverrideService.getOrganizationOverrideForFeature(
    orgIdNum,
    featureSlug
  );

  return successResponse(override).response;
}
