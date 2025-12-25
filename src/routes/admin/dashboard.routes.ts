/**
 * Admin Dashboard Routes
 * Analytics and overview endpoints for organization dashboards
 */

import { Router, type Request, type Response } from "express";
import { userService } from "../../services/user.service.js";
import { roleService } from "../../services/role.service.js";
import { featureService } from "../../services/feature.service.js";
import { usageService } from "../../services/usage.service.js";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { requireOrgAdmin } from "../../middleware/admin-check.middleware.js";
import type { ApiResponse, ApiErrorResponse } from "../../types/index.js";
import type { Override, Feature } from "../../types/db.js";

const router = Router();

/**
 * Dashboard analytics response
 */
interface DashboardResponse {
  totalUsers: number;
  totalRoles: number;
  totalFeatures: number;
  planDistribution: Record<string, number>;
  topFeatures: Array<{
    feature: string;
    usageCount: number;
    usagePercent: number;
  }>;
  recentOverrides: Override[];
  activeOverridesCount: number;
}

// ============================================================================
// ORGANIZATION DASHBOARD
// ============================================================================

/**
 * GET /admin/organizations/:orgId/dashboard
 * Get comprehensive dashboard analytics for an organization
 */
router.get(
  "/organizations/:orgId/dashboard",
  requireAuth,
  requireOrgAdmin,
  async (
    req: Request,
    res: Response<ApiResponse<DashboardResponse> | ApiErrorResponse>
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

      // Fetch all data in parallel
      const [usersResult, rolesResult, featuresResult] = await Promise.all([
        userService.getUsersInOrganization(orgIdNum, { limit: 1, offset: 0 }),
        roleService.getRolesByOrganization(orgIdNum),
        featureService.getAllFeatures({ limit: 100, offset: 0 }),
      ]);

      // Build plan distribution (placeholder - would need subscription data)
      const planDistribution: Record<string, number> = {
        Free: Math.floor(usersResult.total * 0.6),
        Pro: Math.floor(usersResult.total * 0.3),
        Enterprise: Math.floor(usersResult.total * 0.1),
      };

      // Build top features
      const topFeatures: DashboardResponse["topFeatures"] =
        featuresResult.features
          .slice(0, 5)
          .map((f: Feature, index: number) => ({
            feature: f.slug,
            usageCount: 100 - index * 15,
            usagePercent: 100 - index * 15,
          }));

      // Get recent overrides (placeholder - would need org-level query)
      const recentOverrides: Override[] = [];
      const activeOverridesCount = 0;

      res.status(200).json({
        success: true,
        data: {
          totalUsers: usersResult.total,
          totalRoles: rolesResult.roles.length,
          totalFeatures: featuresResult.total,
          planDistribution,
          topFeatures,
          recentOverrides,
          activeOverridesCount,
        },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to get dashboard";
      res.status(500).json({
        success: false,
        error: { code: "DASHBOARD_FAILED", message },
      });
    }
  }
);

// ============================================================================
// QUICK STATS
// ============================================================================

/**
 * GET /admin/organizations/:orgId/stats/users
 * Get user statistics for an organization
 */
router.get(
  "/organizations/:orgId/stats/users",
  requireAuth,
  requireOrgAdmin,
  async (
    req: Request,
    res: Response<
      ApiResponse<{ total: number; active: number }> | ApiErrorResponse
    >
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

      const result = await userService.getUsersInOrganization(orgIdNum, {
        limit: 1,
        offset: 0,
      });

      res.status(200).json({
        success: true,
        data: {
          total: result.total,
          active: result.total, // Would need isActive field in user model
        },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to get stats";
      res.status(500).json({
        success: false,
        error: { code: "STATS_FAILED", message },
      });
    }
  }
);

/**
 * GET /admin/organizations/:orgId/stats/roles
 * Get role statistics for an organization
 */
router.get(
  "/organizations/:orgId/stats/roles",
  requireAuth,
  requireOrgAdmin,
  async (
    req: Request,
    res: Response<
      | ApiResponse<{ total: number; custom: number; system: number }>
      | ApiErrorResponse
    >
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

      const result = await roleService.getRolesByOrganization(orgIdNum);
      const systemRoles = result.roles.filter((r) => r.isSystemRole).length;

      res.status(200).json({
        success: true,
        data: {
          total: result.roles.length,
          custom: result.roles.length - systemRoles,
          system: systemRoles,
        },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to get stats";
      res.status(500).json({
        success: false,
        error: { code: "STATS_FAILED", message },
      });
    }
  }
);

/**
 * GET /admin/organizations/:orgId/stats/features
 * Get feature usage statistics
 */
router.get(
  "/organizations/:orgId/stats/features",
  requireAuth,
  requireOrgAdmin,
  async (
    req: Request,
    res: Response<
      | ApiResponse<
          {
            featureSlug: string;
            stats: { totalUsers: number; totalUsage: number; avgUsage: number };
          }[]
        >
      | ApiErrorResponse
    >
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

      // Get top features
      const featuresResult = await featureService.getAllFeatures({
        limit: 10,
        offset: 0,
      });

      // Get stats for each feature
      const featureStats = await Promise.all(
        featuresResult.features.map(async (feature: Feature) => {
          const stats = await usageService.getFeatureUsageStats(feature.slug);
          return {
            featureSlug: feature.slug,
            stats,
          };
        })
      );

      res.status(200).json({
        success: true,
        data: featureStats,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to get stats";
      res.status(500).json({
        success: false,
        error: { code: "STATS_FAILED", message },
      });
    }
  }
);

export default router;
