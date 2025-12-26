/**
 * Admin Organizations Routes
 * Route definitions for organization management
 */

import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { requireOrgAdmin } from "../../middleware/admin-check.middleware.js";
import { asyncHandler } from "../../utils/async-handler.js";
import * as organizationsController from "../../controllers/admin/organizations.controller.js";

const router = Router();

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
  asyncHandler(organizationsController.createOrganization)
);

/**
 * GET /admin/organizations/:orgId
 * Get organization details
 */
router.get(
  "/organizations/:orgId",
  requireAuth,
  requireOrgAdmin,
  asyncHandler(organizationsController.getOrganization)
);

/**
 * PUT /admin/organizations/:orgId
 * Update organization details
 */
router.put(
  "/organizations/:orgId",
  requireAuth,
  requireOrgAdmin,
  asyncHandler(organizationsController.updateOrganization)
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
  asyncHandler(organizationsController.listMembers)
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
  asyncHandler(organizationsController.getOrganizationOverview)
);

export default router;
