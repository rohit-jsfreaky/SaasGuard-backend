/**
 * Plan Routes
 * Route definitions for plan management
 */

import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/async-handler.js";
import * as planController from "../controllers/plan.controller.js";

const router = Router();

// =============================================================================
// PLAN CRUD ROUTES
// =============================================================================

/**
 * POST /admin/plans
 * Create a new plan
 */
router.post("/", requireAuth, asyncHandler(planController.createPlan));

/**
 * GET /admin/plans
 * List all plans
 */
router.get("/", asyncHandler(planController.listPlans));

/**
 * GET /admin/plans/:id
 * Get a plan by ID with features and limits
 */
router.get("/:id", asyncHandler(planController.getPlan));

/**
 * PUT /admin/plans/:id
 * Update a plan
 */
router.put("/:id", requireAuth, asyncHandler(planController.updatePlan));

/**
 * DELETE /admin/plans/:id
 * Delete a plan
 */
router.delete("/:id", requireAuth, asyncHandler(planController.deletePlan));

// =============================================================================
// PLAN FEATURES ROUTES
// =============================================================================

/**
 * POST /admin/plans/:id/features
 * Add a feature to a plan
 */
router.post("/:id/features", requireAuth, asyncHandler(planController.addFeatureToPlan));

/**
 * GET /admin/plans/:id/features
 * Get all features for a plan
 */
router.get("/:id/features", asyncHandler(planController.getPlanFeatures));

/**
 * DELETE /admin/plans/:id/features/:featureId
 * Remove a feature from a plan
 */
router.delete(
  "/:id/features/:featureId",
  requireAuth,
  asyncHandler(planController.removeFeatureFromPlan)
);

// =============================================================================
// PLAN LIMITS ROUTES
// =============================================================================

/**
 * POST /admin/plans/:id/limits
 * Set a limit for a feature in a plan
 */
router.post("/:id/limits", requireAuth, asyncHandler(planController.setPlanLimit));

/**
 * GET /admin/plans/:id/limits
 * Get all limits for a plan
 */
router.get("/:id/limits", asyncHandler(planController.getPlanLimits));

/**
 * DELETE /admin/plans/:id/limits/:featureSlug
 * Remove a limit from a plan (makes feature unlimited)
 */
router.delete("/:id/limits/:featureSlug", requireAuth, asyncHandler(planController.removePlanLimit));

export default router;

