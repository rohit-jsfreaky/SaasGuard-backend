/**
 * Usage Routes
 * Route definitions for usage management
 */

import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/async-handler.js";
import * as usageController from "../controllers/usage.controller.js";

const router = Router();

// =============================================================================
// USER USAGE ROUTES
// =============================================================================

/**
 * POST /admin/users/:userId/usage/:featureSlug
 * Record usage for a user and feature
 */
router.post(
  "/users/:userId/usage/:featureSlug",
  requireAuth,
  asyncHandler(usageController.recordUsage)
);

/**
 * GET /admin/users/:userId/usage
 * Get all usage for a user
 */
router.get("/users/:userId/usage", asyncHandler(usageController.getUserUsage));

/**
 * GET /admin/users/:userId/usage/:featureSlug
 * Get usage for a specific feature
 */
router.get(
  "/users/:userId/usage/:featureSlug",
  asyncHandler(usageController.getUsage)
);

/**
 * POST /admin/users/:userId/usage/:featureSlug/reset
 * Reset usage for a specific feature
 */
router.post(
  "/users/:userId/usage/:featureSlug/reset",
  requireAuth,
  asyncHandler(usageController.resetUsage)
);

/**
 * POST /admin/users/:userId/usage/reset-all
 * Reset all usage for a user
 */
router.post(
  "/users/:userId/usage/reset-all",
  requireAuth,
  asyncHandler(usageController.resetAllUsageForUser)
);

// =============================================================================
// ADMIN ROUTES
// =============================================================================

/**
 * POST /admin/usage/reset-all
 * Reset all monthly usage (admin only)
 */
router.post("/usage/reset-all", requireAuth, asyncHandler(usageController.resetAllUsage));

/**
 * GET /admin/usage/stats/:featureSlug
 * Get usage statistics for a feature
 */
router.get("/usage/stats/:featureSlug", asyncHandler(usageController.getFeatureUsageStats));

export default router;

