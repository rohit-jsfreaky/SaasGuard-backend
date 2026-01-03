import express from "express";
import { authenticate } from "../middlewares/auth.middleware.js";
import { requireAdmin } from "../middlewares/admin-check.middleware.js";
import * as apiKeysController from "../controllers/api-keys.controller.js";

const router = express.Router();

/**
 * API Key Management Routes
 * All routes require Clerk authentication and admin privileges
 *
 * These are for the DASHBOARD - to manage API keys
 * The actual API key usage is in /api/v1/* routes
 */

// Get available scopes
router.get(
  "/organizations/:orgId/api-keys/scopes",
  authenticate,
  requireAdmin,
  apiKeysController.getAvailableScopes
);

// List all API keys for organization
router.get(
  "/organizations/:orgId/api-keys",
  authenticate,
  requireAdmin,
  apiKeysController.listApiKeys
);

// Create new API key
router.post(
  "/organizations/:orgId/api-keys",
  authenticate,
  requireAdmin,
  apiKeysController.createApiKey
);

// Revoke an API key (soft delete)
router.post(
  "/organizations/:orgId/api-keys/:keyId/revoke",
  authenticate,
  requireAdmin,
  apiKeysController.revokeApiKey
);

// Delete an API key permanently
router.delete(
  "/organizations/:orgId/api-keys/:keyId",
  authenticate,
  requireAdmin,
  apiKeysController.deleteApiKey
);

export default router;
