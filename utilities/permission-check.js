import usageService from "../services/usage.service.js";
import cacheService from "../services/cache.service.js";
import cacheKeys from "./cache-keys.js";
import logger from "./logger.js";

/**
 * Permission Check Utilities
 * Helper functions for checking permissions in controllers/handlers
 */

/**
 * Check if user has permission for a feature
 *
 * @param {Object} permissions - PermissionMap from resolvePermissions
 * @param {string} feature - Feature slug to check
 * @returns {boolean} True if user has permission
 *
 * @example
 * if (can(req.permissions, 'delete_post')) {
 *   await deletePost(postId);
 * }
 */
export function can(permissions, feature) {
  if (!permissions || !permissions.features) {
    return false;
  }
  return permissions.features[feature] === true;
}

/**
 * Get limit info for a feature
 *
 * @param {Object} permissions - PermissionMap from resolvePermissions
 * @param {string} feature - Feature slug
 * @returns {Object|null} Limit info { max, used, remaining } or null if unlimited
 *
 * @example
 * const limitInfo = limit(req.permissions, 'api_calls');
 * if (limitInfo) {
 *   console.log(`Remaining: ${limitInfo.remaining}`);
 * }
 */
export function limit(permissions, feature) {
  if (!permissions || !permissions.limits) {
    return null;
  }
  return permissions.limits[feature] || null;
}

/**
 * Check if user is within usage limit
 *
 * @param {Object} permissions - PermissionMap
 * @param {string} feature - Feature slug
 * @returns {boolean} True if user has remaining usage
 */
export function hasRemainingLimit(permissions, feature) {
  const limitInfo = limit(permissions, feature);
  if (!limitInfo) {
    return true; // No limit = unlimited
  }
  return limitInfo.remaining > 0;
}

/**
 * Record usage after a successful action
 * Call this AFTER the action succeeds, not before
 *
 * @param {number} userId - Database user ID
 * @param {string} featureSlug - Feature slug
 * @param {number} amount - Usage amount (default: 1)
 * @param {number} organizationId - Organization ID for cache invalidation
 * @returns {Promise<Object>} Updated usage record
 *
 * @example
 * // In controller after successful action:
 * await createPost(data);
 * await recordUsageAfterSuccess(req.dbUser.id, 'create_post', 1, req.orgId);
 */
export async function recordUsageAfterSuccess(
  userId,
  featureSlug,
  amount = 1,
  organizationId = null
) {
  try {
    const result = await usageService.recordUsage(userId, featureSlug, amount);

    // Invalidate permission cache since usage changed
    if (organizationId) {
      await cacheService.del(
        cacheKeys.userPermissions(String(userId), organizationId)
      );
    }

    logger.debug(
      {
        userId,
        feature: featureSlug,
        amount,
      },
      "Usage recorded after success"
    );

    return result;
  } catch (error) {
    // Log but don't fail the main action
    logger.error(
      {
        error: error.message,
        userId,
        feature: featureSlug,
      },
      "Failed to record usage"
    );

    // Return null to indicate recording failed
    return null;
  }
}

/**
 * Get all features the user has access to
 *
 * @param {Object} permissions - PermissionMap
 * @returns {string[]} Array of feature slugs
 */
export function getAllowedFeatures(permissions) {
  if (!permissions || !permissions.features) {
    return [];
  }
  return Object.entries(permissions.features)
    .filter(([_, allowed]) => allowed === true)
    .map(([slug]) => slug);
}

/**
 * Get all features the user is denied
 *
 * @param {Object} permissions - PermissionMap
 * @returns {string[]} Array of feature slugs
 */
export function getDeniedFeatures(permissions) {
  if (!permissions || !permissions.features) {
    return [];
  }
  return Object.entries(permissions.features)
    .filter(([_, allowed]) => allowed === false)
    .map(([slug]) => slug);
}

/**
 * Get all features with limits
 *
 * @param {Object} permissions - PermissionMap
 * @returns {Object[]} Array of { feature, max, used, remaining }
 */
export function getFeaturesWithLimits(permissions) {
  if (!permissions || !permissions.limits) {
    return [];
  }
  return Object.entries(permissions.limits).map(([feature, info]) => ({
    feature,
    ...info,
  }));
}

/**
 * Check multiple permissions at once
 *
 * @param {Object} permissions - PermissionMap
 * @param {string[]} features - Array of feature slugs
 * @returns {Object} Object with feature slug as key and boolean as value
 *
 * @example
 * const checks = canMultiple(req.permissions, ['edit_post', 'delete_post']);
 * // { edit_post: true, delete_post: false }
 */
export function canMultiple(permissions, features) {
  const result = {};
  for (const feature of features) {
    result[feature] = can(permissions, feature);
  }
  return result;
}

export default {
  can,
  limit,
  hasRemainingLimit,
  recordUsageAfterSuccess,
  getAllowedFeatures,
  getDeniedFeatures,
  getFeaturesWithLimits,
  canMultiple,
};
