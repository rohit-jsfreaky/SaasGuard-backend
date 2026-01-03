import logger from "../utilities/logger.js";

/**
 * Enforce limit middleware factory
 * Checks if user has remaining usage for a feature
 *
 * IMPORTANT: This middleware must run AFTER authorizeFeature middleware
 * which resolves and attaches permissions to req.permissions
 *
 * Usage:
 *   router.post('/posts',
 *     authenticate,
 *     authorizeFeature('create_post'),
 *     enforceLimit('create_post'),
 *     handler
 *   )
 *
 * @param {string} featureName - Feature slug to check limit for
 * @returns {Function} Express middleware
 */
export const enforceLimit = (featureName) => {
  return async (req, res, next) => {
    try {
      // Permissions must be resolved by authorizeFeature middleware first
      const permissions = req.permissions;

      if (!permissions) {
        logger.error(
          { featureName },
          "enforceLimit called without permissions - authorizeFeature must run first"
        );
        return res.status(500).json({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Server configuration error",
          },
        });
      }

      // Get limit info for the feature
      const limitInfo = permissions.limits?.[featureName];

      // If no limit defined for this feature, allow through (unlimited)
      if (!limitInfo) {
        logger.debug(
          { featureName },
          "No limit defined for feature - allowing unlimited"
        );
        next();
        return;
      }

      const { max, used, remaining } = limitInfo;

      // Check if user has remaining usage
      if (remaining <= 0) {
        logger.warn(
          {
            userId: req.dbUser?.id,
            feature: featureName,
            max,
            used,
            remaining,
            url: req.url,
          },
          "Usage limit exceeded"
        );

        return res.status(429).json({
          success: false,
          error: {
            code: "USAGE_LIMIT_EXCEEDED",
            message: "You have reached your usage limit for this feature",
            feature: featureName,
            limit: max,
            used: used,
            remaining: 0,
          },
        });
      }

      // Attach limit info to request for handler use
      req.featureLimit = {
        feature: featureName,
        max,
        used,
        remaining,
      };

      logger.debug(
        {
          feature: featureName,
          max,
          used,
          remaining,
        },
        "Usage limit check passed"
      );

      next();
    } catch (error) {
      logger.error(
        {
          error: error.message,
          feature: featureName,
        },
        "Limit enforcement failed"
      );

      // On error, fail closed (deny access)
      return res.status(500).json({
        success: false,
        error: {
          code: "LIMIT_CHECK_FAILED",
          message: "Failed to verify usage limit",
        },
      });
    }
  };
};

/**
 * Check limit without blocking - attaches limit info to request
 * Useful when you want to show usage info without blocking
 *
 * @param {string} featureName - Feature slug to check
 * @returns {Function} Express middleware
 */
export const attachLimitInfo = (featureName) => {
  return async (req, res, next) => {
    try {
      const permissions = req.permissions;

      if (!permissions) {
        next();
        return;
      }

      const limitInfo = permissions.limits?.[featureName];

      if (limitInfo) {
        req.featureLimit = {
          feature: featureName,
          ...limitInfo,
        };
      }

      next();
    } catch (error) {
      logger.warn({ error, featureName }, "Failed to attach limit info");
      next(); // Continue anyway - this is optional
    }
  };
};

export default enforceLimit;
