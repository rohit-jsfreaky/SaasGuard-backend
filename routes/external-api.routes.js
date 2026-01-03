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
 * Enforces plan limits - returns 403 if limit would be exceeded
 */
router.post(
  "/usage/record",
  requireApiKey(API_KEY_SCOPES.USAGE_WRITE),
  asyncHandler(async (req, res) => {
    const {
      userId,
      clerkId,
      featureSlug,
      amount = 1,
      enforceLimit = true,
    } = req.body;
    const organizationId = req.organizationId;

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

    // Check limit before recording (if enforceLimit is true)
    if (enforceLimit) {
      // Get user's permissions which include limits and current usage
      const permissions = await permissionResolutionService.resolvePermissions(
        dbUser.id,
        organizationId
      );

      const limitInfo = permissions.limits[featureSlug];

      if (limitInfo) {
        // Feature has a limit - check if recording would exceed it
        const newUsage = limitInfo.used + parseInt(amount, 10);

        if (newUsage > limitInfo.max) {
          logger.warn(
            {
              userId: dbUser.id,
              featureSlug,
              currentUsage: limitInfo.used,
              requestedAmount: amount,
              limit: limitInfo.max,
            },
            "Usage limit exceeded"
          );

          return res.status(403).json({
            success: false,
            error: {
              code: "LIMIT_EXCEEDED",
              message: `Usage limit exceeded for feature '${featureSlug}'`,
              limit: limitInfo.max,
              currentUsage: limitInfo.used,
              requestedAmount: parseInt(amount, 10),
              remaining: limitInfo.remaining,
            },
          });
        }
      }
      // If no limitInfo, feature has unlimited usage - allow recording
    }

    // Record the usage
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

/**
 * POST /api/v1/users/plan
 * Assign a plan to a user
 */
router.post(
  "/users/plan",
  requireApiKey(API_KEY_SCOPES.PLANS_WRITE),
  asyncHandler(async (req, res) => {
    const { userId, clerkId, planSlug } = req.body;
    const organizationId = req.organizationId; // From API key

    if (!userId && !clerkId) {
      throw new ValidationError("Either userId or clerkId is required");
    }
    if (!planSlug) {
      throw new ValidationError("planSlug is required");
    }

    // Get user
    let dbUser;
    if (userId) {
      dbUser = await usersService.getUserById(parseInt(userId, 10));
    } else if (clerkId) {
      dbUser = await usersService.getUserByClerkId(clerkId);
    }

    if (!dbUser) {
      throw new NotFoundError("User not found");
    }

    // Import services
    const plansService = (await import("../services/plans.service.js")).default;
    const userPlansService = (await import("../services/user-plans.service.js"))
      .default;

    // Get plan by slug
    const plan = await plansService.getPlanBySlug(organizationId, planSlug);
    if (!plan) {
      throw new NotFoundError(`Plan with slug '${planSlug}' not found`);
    }

    // Assign plan to user
    const assignment = await userPlansService.assignPlanToUser(
      dbUser.id,
      plan.id,
      organizationId
    );

    logger.info(
      {
        userId: dbUser.id,
        planSlug,
        organizationId,
        apiKey: req.apiKey.keyPrefix,
      },
      "Plan assigned via API key"
    );

    res.status(201).json({
      success: true,
      data: assignment,
    });
  })
);

/**
 * DELETE /api/v1/users/plan
 * Remove plan from a user
 */
router.delete(
  "/users/plan",
  requireApiKey(API_KEY_SCOPES.PLANS_WRITE),
  asyncHandler(async (req, res) => {
    const { userId, clerkId } = req.body;
    const organizationId = req.organizationId;

    if (!userId && !clerkId) {
      throw new ValidationError("Either userId or clerkId is required");
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

    const userPlansService = (await import("../services/user-plans.service.js"))
      .default;
    await userPlansService.removePlanFromUser(dbUser.id, organizationId);

    logger.info(
      {
        userId: dbUser.id,
        organizationId,
        apiKey: req.apiKey.keyPrefix,
      },
      "Plan removed via API key"
    );

    res.status(204).send();
  })
);

/**
 * POST /api/v1/users/role
 * Assign a role to a user
 */
router.post(
  "/users/role",
  requireApiKey(API_KEY_SCOPES.ROLES_WRITE),
  asyncHandler(async (req, res) => {
    const { userId, clerkId, roleSlug } = req.body;
    const organizationId = req.organizationId;

    if (!userId && !clerkId) {
      throw new ValidationError("Either userId or clerkId is required");
    }
    if (!roleSlug) {
      throw new ValidationError("roleSlug is required");
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

    const rolesService = (await import("../services/roles.service.js")).default;
    const userRolesService = (await import("../services/user-roles.service.js"))
      .default;

    // Get role by slug
    const role = await rolesService.getRoleBySlug(roleSlug, organizationId);
    if (!role) {
      throw new NotFoundError(`Role with slug '${roleSlug}' not found`);
    }

    // Assign role to user (returns void)
    await userRolesService.assignRoleToUser(dbUser.id, role.id, organizationId);

    logger.info(
      {
        userId: dbUser.id,
        roleSlug,
        organizationId,
        apiKey: req.apiKey.keyPrefix,
      },
      "Role assigned via API key"
    );

    res.status(201).json({
      success: true,
      data: {
        userId: dbUser.id,
        roleId: role.id,
        role: {
          id: role.id,
          name: role.name,
          slug: role.slug,
        },
        assignedAt: new Date().toISOString(),
      },
    });
  })
);

/**
 * DELETE /api/v1/users/role
 * Remove a role from a user
 */
router.delete(
  "/users/role",
  requireApiKey(API_KEY_SCOPES.ROLES_WRITE),
  asyncHandler(async (req, res) => {
    const { userId, clerkId, roleSlug } = req.body;
    const organizationId = req.organizationId;

    if (!userId && !clerkId) {
      throw new ValidationError("Either userId or clerkId is required");
    }
    if (!roleSlug) {
      throw new ValidationError("roleSlug is required");
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

    const rolesService = (await import("../services/roles.service.js")).default;
    const userRolesService = (await import("../services/user-roles.service.js"))
      .default;

    const role = await rolesService.getRoleBySlug(roleSlug, organizationId);
    if (!role) {
      throw new NotFoundError(`Role with slug '${roleSlug}' not found`);
    }

    await userRolesService.removeRoleFromUser(
      dbUser.id,
      role.id,
      organizationId
    );

    logger.info(
      {
        userId: dbUser.id,
        roleSlug,
        organizationId,
        apiKey: req.apiKey.keyPrefix,
      },
      "Role removed via API key"
    );

    res.status(204).send();
  })
);

/**
 * GET /api/v1/users/plan
 * Get user's current plan
 */
router.get(
  "/users/plan",
  requireApiKey(API_KEY_SCOPES.PERMISSIONS_READ),
  asyncHandler(async (req, res) => {
    const { userId, clerkId } = req.query;
    const organizationId = req.organizationId;

    if (!userId && !clerkId) {
      throw new ValidationError("Either userId or clerkId is required");
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

    const userPlansService = (await import("../services/user-plans.service.js"))
      .default;
    const plan = await userPlansService.getUserPlan(dbUser.id, organizationId);

    res.json({
      success: true,
      data: plan,
    });
  })
);

/**
 * GET /api/v1/users/roles
 * Get user's assigned roles
 */
router.get(
  "/users/roles",
  requireApiKey(API_KEY_SCOPES.PERMISSIONS_READ),
  asyncHandler(async (req, res) => {
    const { userId, clerkId } = req.query;
    const organizationId = req.organizationId;

    if (!userId && !clerkId) {
      throw new ValidationError("Either userId or clerkId is required");
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

    const userRolesService = (await import("../services/user-roles.service.js"))
      .default;
    const roles = await userRolesService.getUserRoles(
      dbUser.id,
      organizationId
    );

    res.json({
      success: true,
      data: roles,
    });
  })
);

export default router;
