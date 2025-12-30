import express from "express";
import { authenticate } from "../middlewares/auth.middleware.js";
import {
  createPlan,
  getPlansByOrganization,
  getPlan,
  updatePlan,
  deletePlan,
  addFeatureToPlan,
  removeFeatureFromPlan,
  getPlanFeatures,
  toggleFeatureInPlan,
  setFeatureLimit,
  getPlanLimits,
  removeFeatureLimit,
} from "../controllers/plans.controller.js";

const router = express.Router();

// All routes require authentication
// Note: Admin check middleware will be added later when the admin feature is implemented

/**
 * Plan CRUD routes
 */
// Create plan for organization
router.post("/organizations/:orgId/plans", authenticate, createPlan);

// List all plans for organization
router.get("/organizations/:orgId/plans", authenticate, getPlansByOrganization);

// Get plan by ID
router.get("/plans/:planId", authenticate, getPlan);

// Update plan
router.put("/plans/:planId", authenticate, updatePlan);

// Delete plan
router.delete("/plans/:planId", authenticate, deletePlan);

/**
 * Plan features routes
 */
// Add feature to plan
router.post("/plans/:planId/features", authenticate, addFeatureToPlan);

// Remove feature from plan
router.delete(
  "/plans/:planId/features/:featureId",
  authenticate,
  removeFeatureFromPlan
);

// Get all features in plan
router.get("/plans/:planId/features", authenticate, getPlanFeatures);

// Toggle feature enabled/disabled
router.put(
  "/plans/:planId/features/:featureId",
  authenticate,
  toggleFeatureInPlan
);

/**
 * Plan limits routes
 */
// Set limit for feature
router.post("/plans/:planId/limits", authenticate, setFeatureLimit);

// Get all limits for plan
router.get("/plans/:planId/limits", authenticate, getPlanLimits);

// Remove limit for feature
router.delete(
  "/plans/:planId/limits/:featureSlug",
  authenticate,
  removeFeatureLimit
);

export default router;
