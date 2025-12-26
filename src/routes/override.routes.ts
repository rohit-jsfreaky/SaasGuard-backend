/**
 * Override Routes
 * Route definitions for override management
 */

import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/async-handler.js";
import * as overrideController from "../controllers/override.controller.js";

const router = Router();

// =============================================================================
// USER OVERRIDE ROUTES
// =============================================================================

/**
 * POST /admin/overrides
 * Create a new user override
 */
router.post("/overrides", requireAuth, asyncHandler(overrideController.createOverride));

/**
 * GET /admin/overrides
 * List overrides (optionally filter by featureSlug)
 */
router.get("/overrides", asyncHandler(overrideController.listOverrides));

/**
 * GET /admin/users/:userId/overrides
 * Get all overrides for a user
 */
router.get("/users/:userId/overrides", asyncHandler(overrideController.getUserOverrides));

/**
 * GET /admin/overrides/:id
 * Get a specific override
 */
router.get("/overrides/:id", asyncHandler(overrideController.getOverride));

/**
 * PUT /admin/overrides/:id
 * Update an override
 */
router.put("/overrides/:id", requireAuth, asyncHandler(overrideController.updateOverride));

/**
 * DELETE /admin/overrides/:id
 * Delete an override
 */
router.delete(
  "/overrides/:id",
  requireAuth,
  asyncHandler(overrideController.deleteOverride)
);

/**
 * POST /admin/overrides/:id/expire
 * Expire an override immediately
 */
router.post(
  "/overrides/:id/expire",
  requireAuth,
  asyncHandler(overrideController.expireOverride)
);

/**
 * GET /admin/users/:userId/features/:featureSlug/override
 * Get override for a specific user and feature
 */
router.get(
  "/users/:userId/features/:featureSlug/override",
  asyncHandler(overrideController.getOverrideForFeature)
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
  asyncHandler(overrideController.createOrganizationOverride)
);

/**
 * GET /admin/organizations/:orgId/overrides
 * Get all overrides for an organization
 */
router.get(
  "/organizations/:orgId/overrides",
  asyncHandler(overrideController.getOrganizationOverrides)
);

/**
 * GET /admin/organizations/:orgId/overrides/:id
 * Get a specific organization override
 */
router.get(
  "/organizations/:orgId/overrides/:id",
  asyncHandler(overrideController.getOrganizationOverride)
);

/**
 * PUT /admin/organizations/:orgId/overrides/:id
 * Update an organization override
 */
router.put(
  "/organizations/:orgId/overrides/:id",
  requireAuth,
  asyncHandler(overrideController.updateOrganizationOverride)
);

/**
 * DELETE /admin/organizations/:orgId/overrides/:id
 * Delete an organization override
 */
router.delete(
  "/organizations/:orgId/overrides/:id",
  requireAuth,
  asyncHandler(overrideController.deleteOrganizationOverride)
);

/**
 * GET /admin/organizations/:orgId/features/:featureSlug/override
 * Get override for a specific organization and feature
 */
router.get(
  "/organizations/:orgId/features/:featureSlug/override",
  asyncHandler(overrideController.getOrganizationOverrideForFeature)
);

export default router;

