import express from "express";
import asyncHandler from "../utilities/async-handler.js";
import { requireApiKey } from "../middlewares/api-key.middleware.js";
import { API_KEY_SCOPES } from "../models/api-keys.model.js";
import { ValidationError, NotFoundError } from "../utilities/errors.js";
import permissionResolutionService from "../services/permission-resolution.service.js";
import usersService from "../services/users.service.js";
import usageService from "../services/usage.service.js";
import logger from "../utilities/logger.js";

const router = express.Router();

/**
 * External API Routes (v1)
 * These routes use API KEY authentication, not Clerk
 * For use by external SaaS apps integrating with SaaS Guard
 */

/**
 * GET /api/v1/permissions
 * Get user permissions using API key
 *
 * Query params:
 * - userId: User ID to check permissions for
 * - clerkId: OR Clerk ID to check permissions for
 *
 * Organization is determined from the API key
 */
router.get(
  "/permissions",
  requireApiKey(API_KEY_SCOPES.PERMISSIONS_READ),
  asyncHandler(async (req, res) => {
    const { userId, clerkId } = req.query;
    const organizationId = req.organizationId; // From API key

    // Must provide either userId or clerkId
    if (!userId && !clerkId) {
      throw new ValidationError(
        "Either userId or clerkId query parameter is required"
      );
    }

    let dbUser;
    if (userId) {
      dbUser = await usersService.getUserById(parseInt(userId, 10));
    } else if (clerkId) {
      dbUser = await usersService.getUserByClerkId(clerkId);
    }

    if (!dbUser) {
      throw new NotFoundError("User not found");
    }

    // Resolve permissions
    const permissions = await permissionResolutionService.resolvePermissions(
      dbUser.id,
      organizationId
    );

    logger.debug(
      {
        userId: dbUser.id,
        organizationId,
        apiKey: req.apiKey.keyPrefix,
      },
      "Permissions resolved via API key"
    );

    res.json({
      success: true,
      data: permissions,
    });
  })
);

/**
 * POST /api/v1/users/sync
 * Sync/create a user from external app
 */
router.post(
  "/users/sync",
  requireApiKey(API_KEY_SCOPES.USERS_SYNC),
  asyncHandler(async (req, res) => {
    const { clerkId, email } = req.body;
    const organizationId = req.organizationId; // From API key

    if (!clerkId) {
      throw new ValidationError("clerkId is required");
    }
    if (!email) {
      throw new ValidationError("email is required");
    }

    const user = await usersService.createOrUpdateUser(
      clerkId,
      email,
      organizationId
    );

    logger.info(
      {
        userId: user.id,
        clerkId,
        organizationId,
        apiKey: req.apiKey.keyPrefix,
      },
      "User synced via API key"
    );

    res.status(201).json({
      success: true,
      data: user,
    });
  })
);

/**
 * POST /api/v1/usage/record
 * Record usage for a user
 */
router.post(
  "/usage/record",
  requireApiKey(API_KEY_SCOPES.USAGE_WRITE),
  asyncHandler(async (req, res) => {
    const { userId, clerkId, featureSlug, amount = 1 } = req.body;

    if (!userId && !clerkId) {
      throw new ValidationError("Either userId or clerkId is required");
    }
    if (!featureSlug) {
      throw new ValidationError("featureSlug is required");
    }

    let dbUser;
    if (userId) {
      dbUser = await usersService.getUserById(parseInt(userId, 10));
    } else if (clerkId) {
      dbUser = await usersService.getUserByClerkId(clerkId);
    }

    if (!dbUser) {
      throw new NotFoundError("User not found");
    }

    const usage = await usageService.recordUsage(
      dbUser.id,
      featureSlug,
      amount
    );

    logger.debug(
      {
        userId: dbUser.id,
        featureSlug,
        amount,
        apiKey: req.apiKey.keyPrefix,
      },
      "Usage recorded via API key"
    );

    res.status(201).json({
      success: true,
      data: usage,
    });
  })
);

/**
 * GET /api/v1/usage
 * Get usage for a user
 */
router.get(
  "/usage",
  requireApiKey(API_KEY_SCOPES.USAGE_READ),
  asyncHandler(async (req, res) => {
    const { userId, clerkId, featureSlug } = req.query;

    if (!userId && !clerkId) {
      throw new ValidationError(
        "Either userId or clerkId query parameter is required"
      );
    }

    let dbUser;
    if (userId) {
      dbUser = await usersService.getUserById(parseInt(userId, 10));
    } else if (clerkId) {
      dbUser = await usersService.getUserByClerkId(clerkId);
    }

    if (!dbUser) {
      throw new NotFoundError("User not found");
    }

    let usage;
    if (featureSlug) {
      usage = await usageService.getUsage(dbUser.id, featureSlug);
      usage = usage ? [usage] : [];
    } else {
      usage = await usageService.getUserUsage(dbUser.id);
    }

    res.json({
      success: true,
      data: usage,
    });
  })
);

/**
 * GET /api/v1/health
 * Simple health check for external apps
 */
router.get("/health", (req, res) => {
  res.json({
    success: true,
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
  });
});

export default router;
