/**
 * Permission Routes
 * Route definitions for permission management
 */

import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/async-handler.js";
import * as permissionController from "../controllers/permission.controller.js";

const router = Router();

// =============================================================================
// USER PERMISSION ROUTES (for authenticated user)
// =============================================================================

/**
 * GET /me/permissions
 * Get resolved permissions for current authenticated user
 */
router.get("/me/permissions", requireAuth, asyncHandler(permissionController.getMyPermissions));

/**
 * GET /me/permissions/check/:featureSlug
 * Check if current user has permission for a specific feature
 */
router.get(
  "/me/permissions/check/:featureSlug",
  requireAuth,
  asyncHandler(permissionController.checkMyPermission)
);

// =============================================================================
// ADMIN PERMISSION ROUTES (for viewing other users' permissions)
// =============================================================================

/**
 * GET /admin/users/:userId/permissions
 * Get resolved permissions for any user (admin only)
 */
router.get(
  "/admin/users/:userId/permissions",
  requireAuth,
  asyncHandler(permissionController.getUserPermissions)
);

/**
 * POST /admin/users/:userId/permissions/check
 * Check multiple permissions for a user (admin only)
 */
router.post(
  "/admin/users/:userId/permissions/check",
  requireAuth,
  asyncHandler(permissionController.checkUserPermissions)
);

/**
 * POST /admin/users/:userId/permissions/invalidate
 * Invalidate cached permissions for a user (admin only)
 */
router.post(
  "/admin/users/:userId/permissions/invalidate",
  requireAuth,
  asyncHandler(permissionController.invalidateUserPermissions)
);

export default router;

