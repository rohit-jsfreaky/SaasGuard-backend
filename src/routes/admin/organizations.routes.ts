/**
 * Admin Organizations Routes
 * Endpoints for managing organizations
 */

import { Router, type Request, type Response } from "express";
import { organizationService } from "../../services/organization.service.js";
import { userService } from "../../services/user.service.js";
import { roleService } from "../../services/role.service.js";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { requireOrgAdmin } from "../../middleware/admin-check.middleware.js";
import { PaginationSchema } from "../../validators/feature.validator.js";
import type { ApiResponse, ApiErrorResponse } from "../../types/index.js";
import type { Organization, User } from "../../types/db.js";
import { z } from "zod";

const router = Router();

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
interface OrgOverviewResponse {
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
interface MemberListResponse {
  members: User[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

// ============================================================================
// ORGANIZATION CRUD
// ============================================================================

/**
 * POST /admin/organizations
 * Create a new organization
 */
router.post(
  "/organizations",
  requireAuth,
  async (
    req: Request,
    res: Response<ApiResponse<Organization> | ApiErrorResponse>
  ): Promise<void> => {
    try {
      const parsed = CreateOrgSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid input",
            details: parsed.error.flatten().fieldErrors as Record<
              string,
              unknown
            >,
          },
        });
        return;
      }

      // Create organization
      const createInput: {
        name: string;
        slug: string;
        clerkOrgId?: string;
        createdBy?: number;
      } = {
        name: parsed.data.name,
        slug: parsed.data.slug,
      };

      if (req.user?.userId) {
        const userIdNum = parseInt(req.user.userId, 10);
        createInput.clerkOrgId = req.user.userId;
        createInput.createdBy = userIdNum;
      }

      const org = await organizationService.createOrganization(createInput);

      res.status(201).json({
        success: true,
        data: org,
        message: "Organization created successfully",
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to create organization";
      res.status(500).json({
        success: false,
        error: { code: "CREATE_FAILED", message },
      });
    }
  }
);

/**
 * GET /admin/organizations/:orgId
 * Get organization details
 */
router.get(
  "/organizations/:orgId",
  requireAuth,
  requireOrgAdmin,
  async (
    req: Request,
    res: Response<ApiResponse<Organization> | ApiErrorResponse>
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

      const org = await organizationService.getOrganization(orgIdNum);
      if (!org) {
        res.status(404).json({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: `Organization not found: ${orgId}`,
          },
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: org,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to get organization";
      res.status(500).json({
        success: false,
        error: { code: "GET_FAILED", message },
      });
    }
  }
);

/**
 * PUT /admin/organizations/:orgId
 * Update organization details
 */
router.put(
  "/organizations/:orgId",
  requireAuth,
  requireOrgAdmin,
  async (
    req: Request,
    res: Response<ApiResponse<Organization> | ApiErrorResponse>
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

      const parsed = UpdateOrgSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid input",
            details: parsed.error.flatten().fieldErrors as Record<
              string,
              unknown
            >,
          },
        });
        return;
      }

      // Filter out undefined values for exactOptionalPropertyTypes
      const updateData: Record<string, string> = {};
      if (parsed.data.name) updateData["name"] = parsed.data.name;
      if (parsed.data.slug) updateData["slug"] = parsed.data.slug;
      if (parsed.data.clerkOrgId)
        updateData["clerkOrgId"] = parsed.data.clerkOrgId;

      const updated = await organizationService.updateOrganization(
        orgIdNum,
        updateData
      );

      res.status(200).json({
        success: true,
        data: updated,
        message: "Organization updated successfully",
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to update organization";
      res.status(500).json({
        success: false,
        error: { code: "UPDATE_FAILED", message },
      });
    }
  }
);

// ============================================================================
// ORGANIZATION MEMBERS
// ============================================================================

/**
 * GET /admin/organizations/:orgId/members
 * List all members of an organization
 */
router.get(
  "/organizations/:orgId/members",
  requireAuth,
  requireOrgAdmin,
  async (
    req: Request,
    res: Response<ApiResponse<MemberListResponse> | ApiErrorResponse>
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
          members: result.users,
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
        error instanceof Error ? error.message : "Failed to list members";
      res.status(500).json({
        success: false,
        error: { code: "LIST_FAILED", message },
      });
    }
  }
);

// ============================================================================
// ORGANIZATION OVERVIEW
// ============================================================================

/**
 * GET /admin/organizations/:orgId/overview
 * Get organization overview with statistics
 */
router.get(
  "/organizations/:orgId/overview",
  requireAuth,
  requireOrgAdmin,
  async (
    req: Request,
    res: Response<ApiResponse<OrgOverviewResponse> | ApiErrorResponse>
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

      // Get organization
      const org = await organizationService.getOrganization(orgIdNum);
      if (!org) {
        res.status(404).json({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: `Organization not found: ${orgId}`,
          },
        });
        return;
      }

      // Get stats
      const [usersResult, roles] = await Promise.all([
        userService.getUsersInOrganization(orgIdNum, { limit: 1, offset: 0 }),
        roleService.getRolesByOrganization(orgIdNum),
      ]);

      // Note: activeOverrides would need a new method to count by org
      // For now, we'll set it to 0 as a placeholder
      const activeOverrides = 0;

      res.status(200).json({
        success: true,
        data: {
          organization: org,
          stats: {
            totalUsers: usersResult.total,
            totalRoles: roles.roles.length,
            activeOverrides,
          },
        },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to get overview";
      res.status(500).json({
        success: false,
        error: { code: "OVERVIEW_FAILED", message },
      });
    }
  }
);

export default router;
