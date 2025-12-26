/**
 * Admin Dashboard Routes
 * Route definitions for dashboard analytics
 */

import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { requireOrgAdmin } from "../../middleware/admin-check.middleware.js";
import { asyncHandler } from "../../utils/async-handler.js";
import * as dashboardController from "../../controllers/admin/dashboard.controller.js";

const router = Router();

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
  asyncHandler(dashboardController.getDashboard)
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
  asyncHandler(dashboardController.getUserStats)
);

/**
 * GET /admin/organizations/:orgId/stats/roles
 * Get role statistics for an organization
 */
router.get(
  "/organizations/:orgId/stats/roles",
  requireAuth,
  requireOrgAdmin,
  asyncHandler(dashboardController.getRoleStats)
);

/**
 * GET /admin/organizations/:orgId/stats/features
 * Get feature usage statistics
 */
router.get(
  "/organizations/:orgId/stats/features",
  requireAuth,
  requireOrgAdmin,
  asyncHandler(dashboardController.getFeatureStats)
);

export default router;
