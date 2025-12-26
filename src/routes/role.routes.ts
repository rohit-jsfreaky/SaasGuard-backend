/**
 * Role Routes
 * Route definitions for role management
 */

import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/async-handler.js";
import * as roleController from "../controllers/role.controller.js";

const router = Router();

// =============================================================================
// ROLE CRUD ROUTES
// =============================================================================

/**
 * POST /admin/organizations/:orgId/roles
 * Create a new role in an organization
 */
router.post(
  "/organizations/:orgId/roles",
  requireAuth,
  asyncHandler(roleController.createRole)
);

/**
 * GET /admin/organizations/:orgId/roles
 * List all roles in an organization
 */
router.get("/organizations/:orgId/roles", asyncHandler(roleController.listRoles));

/**
 * GET /admin/roles/:id
 * Get a role by ID with permissions
 */
router.get("/roles/:id", asyncHandler(roleController.getRole));

/**
 * PUT /admin/roles/:id
 * Update a role
 */
router.put("/roles/:id", requireAuth, asyncHandler(roleController.updateRole));

/**
 * DELETE /admin/roles/:id
 * Delete a role
 */
router.delete("/roles/:id", requireAuth, asyncHandler(roleController.deleteRole));

// =============================================================================
// ROLE PERMISSION ROUTES
// =============================================================================

/**
 * POST /admin/roles/:id/permissions
 * Grant a permission to a role
 */
router.post(
  "/roles/:id/permissions",
  requireAuth,
  asyncHandler(roleController.grantPermissionToRole)
);

/**
 * GET /admin/roles/:id/permissions
 * Get all permissions for a role
 */
router.get("/roles/:id/permissions", asyncHandler(roleController.getRolePermissions));

/**
 * DELETE /admin/roles/:id/permissions/:featureSlug
 * Revoke a permission from a role
 */
router.delete(
  "/roles/:id/permissions/:featureSlug",
  requireAuth,
  asyncHandler(roleController.revokePermissionFromRole)
);

// =============================================================================
// USER ROLE ROUTES
// =============================================================================

/**
 * POST /admin/users/:userId/roles
 * Assign a role to a user
 */
router.post(
  "/users/:userId/roles",
  requireAuth,
  asyncHandler(roleController.assignRoleToUser)
);

/**
 * GET /admin/users/:userId/roles
 * Get all roles for a user (requires orgId query param)
 */
router.get("/users/:userId/roles", asyncHandler(roleController.getUserRoles));

/**
 * GET /admin/users/:userId/permissions
 * Get all permissions for a user (requires orgId query param)
 */
router.get(
  "/users/:userId/permissions",
  asyncHandler(roleController.getUserRolePermissions)
);

/**
 * DELETE /admin/users/:userId/roles/:roleId
 * Remove a role from a user (requires orgId query param)
 */
router.delete(
  "/users/:userId/roles/:roleId",
  requireAuth,
  asyncHandler(roleController.removeRoleFromUser)
);

export default router;

