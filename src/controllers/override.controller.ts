import { Router, type Request, type Response } from "express";
import { overrideService } from "../services/override.service.js";
import { organizationOverrideService } from "../services/organization-override.service.js";
import {
  CreateOverrideSchema,
  UpdateOverrideSchema,
} from "../validators/override.validator.js";
import { PaginationSchema } from "../validators/feature.validator.js";
import type { ApiResponse, ApiErrorResponse } from "../types/index.js";
import type { Override, OrganizationOverride } from "../types/db.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = Router();

/**
 * Override list response type
 */
interface OverrideListResponse {
  overrides: Override[];
  total: number;
}

// =============================================================================
// USER OVERRIDE ROUTES
// =============================================================================

/**
 * POST /admin/overrides
 * Create a new user override
 */
router.post(
  "/overrides",
  requireAuth,
  async (
    req: Request,
    res: Response<ApiResponse<Override> | ApiErrorResponse>
  ): Promise<void> => {
    try {
      const parsed = CreateOverrideSchema.safeParse(req.body);
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

      const { userId, featureSlug, overrideType, value, expiresAt } =
        parsed.data;

      // Get the actor from auth context
      const createdBy = req.user?.userId
        ? parseInt(req.user.userId, 10)
        : undefined;

      const override = await overrideService.createOverride(
        userId,
        featureSlug,
        overrideType,
        value,
        expiresAt,
        isNaN(createdBy ?? NaN) ? undefined : createdBy
      );

      res.status(201).json({
        success: true,
        data: override,
        message: "Override created successfully",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create override";
      res.status(500).json({
        success: false,
        error: { code: "CREATE_FAILED", message },
      });
    }
  }
);

/**
 * GET /admin/overrides
 * List overrides (optionally filter by featureSlug)
 */
router.get(
  "/overrides",
  async (
    req: Request,
    res: Response<ApiResponse<OverrideListResponse> | ApiErrorResponse>
  ): Promise<void> => {
    try {
      const { featureSlug } = req.query;
      const pagination = PaginationSchema.safeParse(req.query);
      const { limit } = pagination.success ? pagination.data : { limit: 50 };

      if (typeof featureSlug === "string" && featureSlug.length > 0) {
        const overrides = await overrideService.listOverridesForFeature(
          featureSlug,
          limit
        );
        res.status(200).json({
          success: true,
          data: { overrides, total: overrides.length },
        });
        return;
      }

      // If no filter, return error - need at least a filter
      res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Please provide featureSlug query parameter",
        },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to list overrides";
      res.status(500).json({
        success: false,
        error: { code: "LIST_FAILED", message },
      });
    }
  }
);

/**
 * GET /admin/users/:userId/overrides
 * Get all overrides for a user
 */
router.get(
  "/users/:userId/overrides",
  async (
    req: Request,
    res: Response<ApiResponse<OverrideListResponse> | ApiErrorResponse>
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

      const { active } = req.query;

      let overrides: Override[];
      if (active === "true") {
        overrides = await overrideService.getActiveOverrides(userIdNum);
      } else {
        overrides = await overrideService.getAllUserOverrides(userIdNum);
      }

      res.status(200).json({
        success: true,
        data: { overrides, total: overrides.length },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to get overrides";
      res.status(500).json({
        success: false,
        error: { code: "GET_FAILED", message },
      });
    }
  }
);

/**
 * GET /admin/overrides/:id
 * Get a specific override
 */
router.get(
  "/overrides/:id",
  async (
    req: Request,
    res: Response<ApiResponse<Override> | ApiErrorResponse>
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const overrideId = parseInt(id ?? "", 10);
      if (isNaN(overrideId)) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Invalid override ID" },
        });
        return;
      }

      const override = await overrideService.getOverrideById(overrideId);
      if (!override) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: `Override not found: ${id}` },
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: override,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to get override";
      res.status(500).json({
        success: false,
        error: { code: "GET_FAILED", message },
      });
    }
  }
);

/**
 * PUT /admin/overrides/:id
 * Update an override
 */
router.put(
  "/overrides/:id",
  requireAuth,
  async (
    req: Request,
    res: Response<ApiResponse<Override> | ApiErrorResponse>
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const overrideId = parseInt(id ?? "", 10);
      if (isNaN(overrideId)) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Invalid override ID" },
        });
        return;
      }

      const parsed = UpdateOverrideSchema.safeParse(req.body);
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

      const updates: { value?: string | null; expiresAt?: Date | null } = {};
      if (parsed.data.value !== undefined) updates.value = parsed.data.value;
      if (parsed.data.expiresAt !== undefined)
        updates.expiresAt = parsed.data.expiresAt;

      const override = await overrideService.updateOverride(
        overrideId,
        updates
      );

      res.status(200).json({
        success: true,
        data: override,
        message: "Override updated successfully",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update override";

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
 * DELETE /admin/overrides/:id
 * Delete an override
 */
router.delete(
  "/overrides/:id",
  requireAuth,
  async (
    req: Request,
    res: Response<ApiResponse<{ deleted: boolean }> | ApiErrorResponse>
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const overrideId = parseInt(id ?? "", 10);
      if (isNaN(overrideId)) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Invalid override ID" },
        });
        return;
      }

      await overrideService.deleteOverride(overrideId);

      res.status(200).json({
        success: true,
        data: { deleted: true },
        message: "Override deleted successfully",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to delete override";

      if (message.includes("not found")) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message },
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

/**
 * POST /admin/overrides/:id/expire
 * Expire an override immediately
 */
router.post(
  "/overrides/:id/expire",
  requireAuth,
  async (
    req: Request,
    res: Response<ApiResponse<{ expired: boolean }> | ApiErrorResponse>
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const overrideId = parseInt(id ?? "", 10);
      if (isNaN(overrideId)) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Invalid override ID" },
        });
        return;
      }

      await overrideService.expireOverride(overrideId);

      res.status(200).json({
        success: true,
        data: { expired: true },
        message: "Override expired successfully",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to expire override";

      if (message.includes("not found")) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message },
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: { code: "EXPIRE_FAILED", message },
      });
    }
  }
);

/**
 * GET /admin/users/:userId/features/:featureSlug/override
 * Get override for a specific user and feature
 */
router.get(
  "/users/:userId/features/:featureSlug/override",
  async (
    req: Request,
    res: Response<ApiResponse<Override | null> | ApiErrorResponse>
  ): Promise<void> => {
    try {
      const { userId, featureSlug } = req.params;
      const userIdNum = parseInt(userId ?? "", 10);

      if (isNaN(userIdNum) || !featureSlug) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Invalid parameters" },
        });
        return;
      }

      const override = await overrideService.getOverrideForFeature(
        userIdNum,
        featureSlug
      );

      res.status(200).json({
        success: true,
        data: override,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to get override";
      res.status(500).json({
        success: false,
        error: { code: "GET_FAILED", message },
      });
    }
  }
);

// =============================================================================
// ORGANIZATION OVERRIDE ROUTES
// =============================================================================

/**
 * POST /admin/organizations/:orgId/overrides
 * Create a new organization override
 */
router.post(
  "/organizations/:orgId/overrides",
  requireAuth,
  async (
    req: Request,
    res: Response<ApiResponse<OrganizationOverride> | ApiErrorResponse>
  ): Promise<void> => {
    try {
      const { orgId } = req.params;
      const orgIdNum = parseInt(orgId ?? "", 10);

      if (isNaN(orgIdNum)) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Invalid organization ID" },
        });
        return;
      }

      const parsed = CreateOverrideSchema.safeParse(req.body);
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

      const { featureSlug, overrideType, value, expiresAt } = parsed.data;

      const createdBy = req.user?.userId
        ? parseInt(req.user.userId, 10)
        : undefined;

      const override = await organizationOverrideService.createOrganizationOverride(
        orgIdNum,
        featureSlug,
        overrideType,
        value,
        expiresAt,
        isNaN(createdBy ?? NaN) ? undefined : createdBy
      );

      res.status(201).json({
        success: true,
        data: override,
        message: "Organization override created successfully",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create override";
      res.status(500).json({
        success: false,
        error: { code: "CREATE_FAILED", message },
      });
    }
  }
);

/**
 * GET /admin/organizations/:orgId/overrides
 * Get all overrides for an organization
 */
router.get(
  "/organizations/:orgId/overrides",
  async (
    req: Request,
    res: Response<ApiResponse<OrganizationOverride[]> | ApiErrorResponse>
  ): Promise<void> => {
    try {
      const { orgId } = req.params;
      const orgIdNum = parseInt(orgId ?? "", 10);

      if (isNaN(orgIdNum)) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Invalid organization ID" },
        });
        return;
      }

      const { active } = req.query;
      const { limit } = PaginationSchema.safeParse(req.query).success
        ? PaginationSchema.parse(req.query)
        : { limit: 50 };

      let overrides: OrganizationOverride[];
      if (active === "true") {
        overrides =
          await organizationOverrideService.getActiveOrganizationOverrides(orgIdNum);
      } else {
        overrides =
          await organizationOverrideService.listOrganizationOverrides(orgIdNum, limit);
      }

      res.status(200).json({
        success: true,
        data: overrides,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to get overrides";
      res.status(500).json({
        success: false,
        error: { code: "GET_FAILED", message },
      });
    }
  }
);

/**
 * GET /admin/organizations/:orgId/overrides/:id
 * Get a specific organization override
 */
router.get(
  "/organizations/:orgId/overrides/:id",
  async (
    req: Request,
    res: Response<ApiResponse<OrganizationOverride> | ApiErrorResponse>
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const overrideId = parseInt(id ?? "", 10);

      if (isNaN(overrideId)) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Invalid override ID" },
        });
        return;
      }

      const override =
        await organizationOverrideService.getOrganizationOverrideById(overrideId);

      if (!override) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: `Override not found: ${id}` },
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: override,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to get override";
      res.status(500).json({
        success: false,
        error: { code: "GET_FAILED", message },
      });
    }
  }
);

/**
 * PUT /admin/organizations/:orgId/overrides/:id
 * Update an organization override
 */
router.put(
  "/organizations/:orgId/overrides/:id",
  requireAuth,
  async (
    req: Request,
    res: Response<ApiResponse<OrganizationOverride> | ApiErrorResponse>
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const overrideId = parseInt(id ?? "", 10);

      if (isNaN(overrideId)) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Invalid override ID" },
        });
        return;
      }

      const parsed = UpdateOverrideSchema.safeParse(req.body);
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

      const updates: { value?: string | null; expiresAt?: Date | null } = {};
      if (parsed.data.value !== undefined) updates.value = parsed.data.value;
      if (parsed.data.expiresAt !== undefined)
        updates.expiresAt = parsed.data.expiresAt;

      const override =
        await organizationOverrideService.updateOrganizationOverride(
          overrideId,
          updates
        );

      res.status(200).json({
        success: true,
        data: override,
        message: "Organization override updated successfully",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update override";

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
 * DELETE /admin/organizations/:orgId/overrides/:id
 * Delete an organization override
 */
router.delete(
  "/organizations/:orgId/overrides/:id",
  requireAuth,
  async (
    req: Request,
    res: Response<ApiResponse<{ deleted: boolean }> | ApiErrorResponse>
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const overrideId = parseInt(id ?? "", 10);

      if (isNaN(overrideId)) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Invalid override ID" },
        });
        return;
      }

      await organizationOverrideService.deleteOrganizationOverride(overrideId);

      res.status(200).json({
        success: true,
        data: { deleted: true },
        message: "Organization override deleted successfully",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to delete override";

      if (message.includes("not found")) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message },
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

/**
 * GET /admin/organizations/:orgId/features/:featureSlug/override
 * Get override for a specific organization and feature
 */
router.get(
  "/organizations/:orgId/features/:featureSlug/override",
  async (
    req: Request,
    res: Response<ApiResponse<OrganizationOverride | null> | ApiErrorResponse>
  ): Promise<void> => {
    try {
      const { orgId, featureSlug } = req.params;
      const orgIdNum = parseInt(orgId ?? "", 10);

      if (isNaN(orgIdNum) || !featureSlug) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Invalid parameters" },
        });
        return;
      }

      const override =
        await organizationOverrideService.getOrganizationOverrideForFeature(
          orgIdNum,
          featureSlug
        );

      res.status(200).json({
        success: true,
        data: override,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to get override";
      res.status(500).json({
        success: false,
        error: { code: "GET_FAILED", message },
      });
    }
  }
);

export default router;
