/**
 * Admin Organizations Controller
 * Pure controller functions for organization management
 */

import type { Request, Response } from "express";
import { organizationService } from "../../services/organization.service.js";
import { userService } from "../../services/user.service.js";
import { roleService } from "../../services/role.service.js";
import { PaginationSchema } from "../../validators/feature.validator.js";
import type { ApiResponse } from "../../types/index.js";
import type { Organization, User } from "../../types/db.js";
import { ValidationError, NotFoundError } from "../../utils/errors.js";
import { successResponse } from "../../utils/async-handler.js";
import { z } from "zod";

/**
 * Create organization schema
 */
const CreateOrgSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[a-z0-9-]+$/),
});

/**
 * Update organization schema
 */
const UpdateOrgSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  slug: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  clerkOrgId: z.string().optional(),
});

/**
 * Organization overview response
 */
export interface OrgOverviewResponse {
  organization: Organization;
  stats: {
    totalUsers: number;
    totalRoles: number;
    activeOverrides: number;
  };
}

/**
 * Member list response
 */
export interface MemberListResponse {
  members: User[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

/**
 * Create a new organization
 */
export async function createOrganization(
  req: Request,
  res: Response
): Promise<ApiResponse<Organization>> {
  const parsed = CreateOrgSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError(
      "Invalid input",
      parsed.error.flatten().fieldErrors as Record<string, unknown>
    );
  }

  // Create organization
  const createInput: {
    name: string;
    slug: string;
    clerkOrgId?: string;
    createdBy?: string;
  } = {
    name: parsed.data.name,
    slug: parsed.data.slug,
  };

  if (req.user?.userId) {
    createInput.createdBy = req.user.userId;
  }

  if (req.user?.organizationId) {
    createInput.clerkOrgId = req.user.organizationId;
  }

  const org = await organizationService.createOrganization(createInput);

  res.statusCode = 201;
  return successResponse(org, "Organization created successfully", 201).response;
}

/**
 * Get organization details
 */
export async function getOrganization(
  req: Request,
  _res: Response
): Promise<ApiResponse<Organization>> {
  const { orgId } = req.params;
  const orgIdNum = parseInt(orgId ?? "", 10);

  if (isNaN(orgIdNum)) {
    throw new ValidationError("Invalid organization ID");
  }

  const org = await organizationService.getOrganization(orgIdNum);
  if (!org) {
    throw new NotFoundError("Organization", orgIdNum);
  }

  return successResponse(org).response;
}

/**
 * Update organization details
 */
export async function updateOrganization(
  req: Request,
  _res: Response
): Promise<ApiResponse<Organization>> {
  const { orgId } = req.params;
  const orgIdNum = parseInt(orgId ?? "", 10);

  if (isNaN(orgIdNum)) {
    throw new ValidationError("Invalid organization ID");
  }

  const parsed = UpdateOrgSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError(
      "Invalid input",
      parsed.error.flatten().fieldErrors as Record<string, unknown>
    );
  }

  // Filter out undefined values for exactOptionalPropertyTypes
  const updateData: Record<string, string> = {};
  if (parsed.data.name) updateData["name"] = parsed.data.name;
  if (parsed.data.slug) updateData["slug"] = parsed.data.slug;
  if (parsed.data.clerkOrgId) updateData["clerkOrgId"] = parsed.data.clerkOrgId;

  const updated = await organizationService.updateOrganization(orgIdNum, updateData);

  return successResponse(updated, "Organization updated successfully").response;
}

/**
 * List all members of an organization
 */
export async function listMembers(
  req: Request,
  _res: Response
): Promise<ApiResponse<MemberListResponse>> {
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
    members: result.users,
    pagination: {
      total: result.total,
      limit,
      offset,
      hasMore: offset + result.users.length < result.total,
    },
  }).response;
}

/**
 * Get organization overview with statistics
 */
export async function getOrganizationOverview(
  req: Request,
  _res: Response
): Promise<ApiResponse<OrgOverviewResponse>> {
  const { orgId } = req.params;
  const orgIdNum = parseInt(orgId ?? "", 10);

  if (isNaN(orgIdNum)) {
    throw new ValidationError("Invalid organization ID");
  }

  // Get organization
  const org = await organizationService.getOrganization(orgIdNum);
  if (!org) {
    throw new NotFoundError("Organization", orgIdNum);
  }

  // Get stats
  const [usersResult, roles] = await Promise.all([
    userService.getUsersInOrganization(orgIdNum, { limit: 1, offset: 0 }),
    roleService.getRolesByOrganization(orgIdNum),
  ]);

  // Note: activeOverrides would need a new method to count by org
  // For now, we'll set it to 0 as a placeholder
  const activeOverrides = 0;

  return successResponse({
    organization: org,
    stats: {
      totalUsers: usersResult.total,
      totalRoles: roles.roles.length,
      activeOverrides,
    },
  }).response;
}

