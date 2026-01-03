import { ForbiddenError } from "../utilities/errors.js";
import logger from "../utilities/logger.js";
import permissionResolutionService from "../services/permission-resolution.service.js";
import usersService from "../services/users.service.js";
import organizationsService from "../services/organizations.service.js";

/**
 * Authorization middleware factory
 * Checks if user has permission for a specific feature
 *
 * Usage:
 *   router.post('/posts', authenticate, authorizeFeature('create_post'), handler)
 *
 * @param {string} requiredFeature - Feature slug to check
 * @returns {Function} Express middleware
 */
export const authorizeFeature = (requiredFeature) => {
  return async (req, res, next) => {
    try {
      const clerkId = req.userId; // From auth middleware

      if (!clerkId) {
        throw new ForbiddenError("Authentication required");
      }

      // Get organization ID from various sources
      let organizationId =
        req.params.orgId || req.body.organizationId || req.query.organizationId;

      // If no orgId in request, get from user's profile
      if (!organizationId) {
        const user = await usersService.getUserByClerkId(clerkId);
        if (!user) {
          throw new ForbiddenError("User not found");
        }
        organizationId = user.organizationId;
        req.dbUser = user; // Cache for later use
      }

      if (!organizationId) {
        throw new ForbiddenError("Organization context required");
      }

      organizationId = parseInt(organizationId, 10);

      // Get user from database if not already cached
      if (!req.dbUser) {
        req.dbUser = await usersService.getUserByClerkId(clerkId);
        if (!req.dbUser) {
          throw new ForbiddenError("User not found");
        }
      }

      // Verify user belongs to organization
      const belongsToOrg = await organizationsService.userBelongsToOrganization(
        req.dbUser.id,
        organizationId
      );
      if (!belongsToOrg) {
        throw new ForbiddenError("You do not have access to this organization");
      }

      // Resolve permissions for user in organization
      const permissions = await permissionResolutionService.resolvePermissions(
        req.dbUser.id,
        organizationId
      );

      // Check if user has the required feature
      const hasFeature = permissions.features[requiredFeature] === true;

      if (!hasFeature) {
        logger.warn(
          {
            userId: req.dbUser.id,
            clerkId,
            organizationId,
            feature: requiredFeature,
            url: req.url,
          },
          "Feature access denied"
        );

        return res.status(403).json({
          success: false,
          error: {
            code: "FEATURE_NOT_AVAILABLE",
            message: "Feature not available in your plan",
            feature: requiredFeature,
          },
        });
      }

      // Attach permissions and org info to request for downstream use
      req.permissions = permissions;
      req.orgId = organizationId;

      logger.debug(
        {
          userId: req.dbUser.id,
          feature: requiredFeature,
          organizationId,
        },
        "Feature access granted"
      );

      next();
    } catch (error) {
      logger.error(
        {
          error: error.message,
          feature: requiredFeature,
          url: req.url,
        },
        "Authorization check failed"
      );

      if (error instanceof ForbiddenError) {
        return next(error);
      }

      next(new ForbiddenError("Authorization failed"));
    }
  };
};

/**
 * Check multiple features - user must have ALL features
 *
 * @param {...string} features - Feature slugs to check
 * @returns {Function} Express middleware
 */
export const authorizeAllFeatures = (...features) => {
  return async (req, res, next) => {
    try {
      const clerkId = req.userId;

      if (!clerkId) {
        throw new ForbiddenError("Authentication required");
      }

      // Get organization ID
      let organizationId =
        req.params.orgId || req.body.organizationId || req.query.organizationId;

      if (!organizationId) {
        const user = await usersService.getUserByClerkId(clerkId);
        if (!user) {
          throw new ForbiddenError("User not found");
        }
        organizationId = user.organizationId;
        req.dbUser = user;
      }

      if (!organizationId) {
        throw new ForbiddenError("Organization context required");
      }

      organizationId = parseInt(organizationId, 10);

      if (!req.dbUser) {
        req.dbUser = await usersService.getUserByClerkId(clerkId);
      }

      // Resolve permissions
      const permissions = await permissionResolutionService.resolvePermissions(
        req.dbUser.id,
        organizationId
      );

      // Check ALL features
      const missingFeatures = features.filter(
        (f) => permissions.features[f] !== true
      );

      if (missingFeatures.length > 0) {
        return res.status(403).json({
          success: false,
          error: {
            code: "FEATURES_NOT_AVAILABLE",
            message: "One or more features not available in your plan",
            features: missingFeatures,
          },
        });
      }

      req.permissions = permissions;
      req.orgId = organizationId;
      next();
    } catch (error) {
      if (error instanceof ForbiddenError) {
        return next(error);
      }
      next(new ForbiddenError("Authorization failed"));
    }
  };
};

/**
 * Check multiple features - user must have ANY of the features
 *
 * @param {...string} features - Feature slugs to check
 * @returns {Function} Express middleware
 */
export const authorizeAnyFeature = (...features) => {
  return async (req, res, next) => {
    try {
      const clerkId = req.userId;

      if (!clerkId) {
        throw new ForbiddenError("Authentication required");
      }

      let organizationId =
        req.params.orgId || req.body.organizationId || req.query.organizationId;

      if (!organizationId) {
        const user = await usersService.getUserByClerkId(clerkId);
        if (!user) {
          throw new ForbiddenError("User not found");
        }
        organizationId = user.organizationId;
        req.dbUser = user;
      }

      if (!organizationId) {
        throw new ForbiddenError("Organization context required");
      }

      organizationId = parseInt(organizationId, 10);

      if (!req.dbUser) {
        req.dbUser = await usersService.getUserByClerkId(clerkId);
      }

      const permissions = await permissionResolutionService.resolvePermissions(
        req.dbUser.id,
        organizationId
      );

      // Check ANY feature
      const hasAny = features.some((f) => permissions.features[f] === true);

      if (!hasAny) {
        return res.status(403).json({
          success: false,
          error: {
            code: "FEATURES_NOT_AVAILABLE",
            message: "None of the required features available in your plan",
            features,
          },
        });
      }

      req.permissions = permissions;
      req.orgId = organizationId;
      next();
    } catch (error) {
      if (error instanceof ForbiddenError) {
        return next(error);
      }
      next(new ForbiddenError("Authorization failed"));
    }
  };
};

export default authorizeFeature;
