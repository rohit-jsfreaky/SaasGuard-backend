/**
 * Admin Users Routes
 * Route definitions for user management
 */

import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { requireOrgAdmin } from "../../middleware/admin-check.middleware.js";
import { asyncHandler } from "../../utils/async-handler.js";
import * as usersController from "../../controllers/admin/users.controller.js";

const router = Router();

// ============================================================================
// USER LIST & DETAILS
// ============================================================================

/**
 * GET /admin/organizations/:orgId/users
 * List all users in an organization
 */
router.get(
  "/organizations/:orgId/users",
  requireAuth,
  requireOrgAdmin,
  asyncHandler(usersController.listUsers)
);

/**
 * GET /admin/users/:userId
 * Get detailed user info including roles, usage, and overrides
 */
router.get("/users/:userId", requireAuth, asyncHandler(usersController.getUserDetails));

// ============================================================================
// USER ROLES MANAGEMENT
// ============================================================================

/**
 * GET /admin/users/:userId/roles
 * List user's roles in an organization
 */
router.get("/users/:userId/roles", requireAuth, asyncHandler(usersController.getUserRoles));

/**
 * POST /admin/users/:userId/roles/:roleId
 * Assign a role to a user
 */
router.post(
  "/users/:userId/roles/:roleId",
  requireAuth,
  asyncHandler(usersController.assignRoleToUser)
);

/**
 * DELETE /admin/users/:userId/roles/:roleId
 * Remove a role from a user
 */
router.delete(
  "/users/:userId/roles/:roleId",
  requireAuth,
  asyncHandler(usersController.removeRoleFromUser)
);

// ============================================================================
// USER USAGE & PERMISSIONS
// ============================================================================

/**
 * GET /admin/users/:userId/usage
 * Get user's usage data
 */
router.get("/users/:userId/usage", requireAuth, asyncHandler(usersController.getUserUsage));

/**
 * GET /admin/users/:userId/permissions
 * Get resolved permissions for a user
 */
router.get(
  "/users/:userId/permissions",
  requireAuth,
  asyncHandler(usersController.getUserPermissions)
);

export default router;
