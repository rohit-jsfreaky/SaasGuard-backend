/**
 * Feature Routes
 * Route definitions for feature management
 */

import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/async-handler.js";
import * as featureController from "../controllers/feature.controller.js";

const router = Router();

/**
 * POST /admin/features
 * Create a new feature
 */
router.post("/", requireAuth, asyncHandler(featureController.createFeature));

/**
 * GET /admin/features
 * List all features with pagination
 */
router.get("/", asyncHandler(featureController.listFeatures));

/**
 * GET /admin/features/search
 * Search features by name or description
 */
router.get("/search", asyncHandler(featureController.searchFeatures));

/**
 * GET /admin/features/:id
 * Get a single feature by ID or slug
 */
router.get("/:id", asyncHandler(featureController.getFeature));

/**
 * PUT /admin/features/:id
 * Update a feature (name and description only, slug is immutable)
 */
router.put("/:id", requireAuth, asyncHandler(featureController.updateFeature));

/**
 * DELETE /admin/features/:id
 * Delete a feature (fails if in use)
 */
router.delete("/:id", requireAuth, asyncHandler(featureController.deleteFeature));

export default router;

