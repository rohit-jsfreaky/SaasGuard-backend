import { ForbiddenError } from "../utilities/errors.js";
import logger from "../utilities/logger.js";
import usersService from "../services/users.service.js";
import organizationsService from "../services/organizations.service.js";
import userRolesService from "../services/user-roles.service.js";

/**
 * Admin slug constant
 * Organizations should create a role with this slug to grant admin access
 */
export const ADMIN_ROLE_SLUG = "admin";

/**
 * Check if user has admin role in organization
 * @param {number} userId - Database user ID
 * @param {number} organizationId - Organization ID
 * @returns {Promise<boolean>} True if user is admin
 */
export async function isUserAdmin(userId, organizationId) {
  try {
    const roles = await userRolesService.getUserRoles(userId, organizationId);
    return roles.some((role) => role.slug === ADMIN_ROLE_SLUG);
  } catch (error) {
    logger.warn(
      { error, userId, organizationId },
      "Failed to check admin status"
    );
    return false;
  }
}

/**
 * Admin check middleware
 * Verifies that the authenticated user has admin privileges in the organization
 *
 * Usage:
 *   router.get('/admin/settings', authenticate, requireAdmin, handler)
 *
 * Requires:
 * - authenticate middleware to run first (sets req.userId)
 * - orgId in params OR user's organizationId
 */
export const requireAdmin = async (req, res, next) => {
  try {
    const clerkId = req.userId; // From auth middleware

    if (!clerkId) {
      throw new ForbiddenError("Authentication required");
    }

    // Get organization ID from request (params, query, body, or user's org)
    let organizationId = parseInt(req.params.orgId, 10);

    // Also check query parameter
    if (!organizationId || isNaN(organizationId)) {
      organizationId = parseInt(req.query.orgId, 10);
    }

    // Also check request body
    if (!organizationId || isNaN(organizationId)) {
      organizationId = parseInt(req.body?.organizationId, 10);
    }

    // Get current user from database
    const currentUser = await usersService.getUserByClerkId(clerkId);
    if (!currentUser) {
      throw new ForbiddenError("User not found");
    }

    // If no orgId found anywhere, use user's organization
    if (!organizationId || isNaN(organizationId)) {
      organizationId = currentUser.organizationId;
    }

    if (!organizationId) {
      throw new ForbiddenError("Organization context required");
    }

    // Check if user belongs to organization
    const belongsToOrg = await organizationsService.userBelongsToOrganization(
      currentUser.id,
      organizationId
    );

    if (!belongsToOrg) {
      logger.warn(
        { userId: currentUser.id, organizationId },
        "User attempted to access org without membership"
      );
      throw new ForbiddenError("You do not have access to this organization");
    }

    // Check if user is organization creator (creators are always admins)
    const org = await organizationsService.getOrganization(organizationId);
    const isCreator = org && org.createdBy === currentUser.id;

    // Check if user has admin role
    const hasAdminRole = await isUserAdmin(currentUser.id, organizationId);

    if (!isCreator && !hasAdminRole) {
      logger.warn(
        {
          userId: currentUser.id,
          organizationId,
          isCreator,
          hasAdminRole,
        },
        "Admin access denied - user is not admin"
      );

      return res.status(403).json({
        success: false,
        error: {
          code: "ADMIN_REQUIRED",
          message: "Admin access required for this operation",
        },
      });
    }

    // Attach user and org info to request
    req.dbUser = currentUser;
    req.org = org;
    req.orgId = organizationId;
    req.isAdmin = true;
    req.isOrgCreator = isCreator;

    logger.debug(
      {
        userId: currentUser.id,
        organizationId,
        isCreator,
        hasAdminRole,
      },
      "Admin access granted"
    );

    next();
  } catch (error) {
    logger.warn({ error: error.message, url: req.url }, "Admin check failed");

    if (error instanceof ForbiddenError) {
      return next(error);
    }

    next(new ForbiddenError("Admin verification failed"));
  }
};

/**
 * Optional admin check - doesn't block, just sets req.isAdmin
 * Useful for routes that work differently for admins vs regular users
 */
export const checkAdmin = async (req, res, next) => {
  try {
    const clerkId = req.userId;

    if (!clerkId) {
      req.isAdmin = false;
      return next();
    }

    const currentUser = await usersService.getUserByClerkId(clerkId);
    if (!currentUser) {
      req.isAdmin = false;
      return next();
    }

    let organizationId = parseInt(req.params.orgId, 10);
    if (!organizationId || isNaN(organizationId)) {
      organizationId = currentUser.organizationId;
    }

    if (!organizationId) {
      req.isAdmin = false;
      return next();
    }

    // Check creator status
    const org = await organizationsService.getOrganization(organizationId);
    const isCreator = org && org.createdBy === currentUser.id;

    // Check admin role
    const hasAdminRole = await isUserAdmin(currentUser.id, organizationId);

    req.dbUser = currentUser;
    req.orgId = organizationId;
    req.isAdmin = isCreator || hasAdminRole;
    req.isOrgCreator = isCreator;

    next();
  } catch (error) {
    req.isAdmin = false;
    next();
  }
};

export default requireAdmin;
