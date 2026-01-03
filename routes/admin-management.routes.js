import express from "express";
import { authenticate } from "../middlewares/auth.middleware.js";
import { requireAdmin } from "../middlewares/admin-check.middleware.js";
import * as adminManagementController from "../controllers/admin-management.controller.js";

const router = express.Router();

/**
 * Admin Management Routes
 * All routes require authentication and admin privileges
 */

// List all admins in organization
router.get(
  "/organizations/:orgId/admins",
  authenticate,
  requireAdmin,
  adminManagementController.listOrganizationAdmins
);

// Make a user an admin
router.post(
  "/organizations/:orgId/admins/:userId",
  authenticate,
  requireAdmin,
  adminManagementController.makeUserAdmin
);

// Remove admin privileges from a user
router.delete(
  "/organizations/:orgId/admins/:userId",
  authenticate,
  requireAdmin,
  adminManagementController.removeAdmin
);

// Get audit log for organization
router.get(
  "/organizations/:orgId/audit-log",
  authenticate,
  requireAdmin,
  adminManagementController.getAuditLog
);

// List all members with admin status
router.get(
  "/organizations/:orgId/members",
  authenticate,
  requireAdmin,
  adminManagementController.listOrganizationMembers
);

export default router;
