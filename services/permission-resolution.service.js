import logger from "../utilities/logger.js";
import { NotFoundError, ValidationError } from "../utilities/errors.js";
import cacheService from "./cache.service.js";
import cacheKeys from "../utilities/cache-keys.js";
import { CACHE_TTL } from "../utilities/cache-keys.js";
import usersService from "./users.service.js";
import userPlansService from "./user-plans.service.js";
import planFeaturesService from "./plan-features.service.js";
import planLimitsService from "./plan-limits.service.js";
import userRolesService from "./user-roles.service.js";
import rolePermissionsService from "./role-permissions.service.js";
import overridesService from "./overrides.service.js";

/**
 * PermissionResolutionService - THE CORE OF SAAS GUARD
 * Resolves user permissions by combining plan, roles, and overrides
 * Priority: Overrides > Roles > Plan > Default
 */
class PermissionResolutionService {
  /**
   * Resolve permissions for user in organization
   * This is the core logic that determines what a user can do
   * @param {number} userId - User ID (database ID)
   * @param {number} organizationId - Organization ID
   * @returns {Promise<Object>} PermissionMap object
   */
  async resolvePermissions(userId, organizationId) {
    if (!userId || !organizationId) {
      throw new ValidationError("User ID and Organization ID are required");
    }

    const cacheKey = cacheKeys.userPermissions(String(userId), organizationId);

    try {
      // Try cache first (5 minute TTL)
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.debug(
          { userId, organizationId },
          "Permissions retrieved from cache"
        );
        return cached;
      }

      // Step 1: Load user (verify exists)
      const user = await usersService.getUserById(userId);
      if (!user) {
        throw new NotFoundError("User not found");
      }

      // Step 2: Load user's plan
      const userPlan = await userPlansService.getUserPlan(
        userId,
        organizationId
      );

      // Step 3: Load plan features (if plan exists)
      let planFeatures = [];
      let planLimitsMap = {};

      if (userPlan) {
        // Note: userPlan.id is the plan's ID (getUserPlan returns plan object with id property)
        planFeatures = await planFeaturesService.getPlanFeatures(userPlan.id);
        const planLimits = await planLimitsService.getPlanLimits(userPlan.id);
        planLimitsMap = planLimits.reduce((acc, limit) => {
          acc[limit.featureSlug] = limit.maxLimit;
          return acc;
        }, {});
      }

      // Step 4: Load user's roles in organization
      const userRoles = await userRolesService.getUserRoles(
        userId,
        organizationId
      );

      // Step 5: Load role permissions (aggregate from all roles)
      const rolePermissionsSet = new Set();
      for (const role of userRoles) {
        const permissions = await rolePermissionsService.getRolePermissions(
          role.id
        );
        permissions.forEach((slug) => rolePermissionsSet.add(slug));
      }
      const rolePermissions = Array.from(rolePermissionsSet);

      // Step 6: Load all overrides (user-level and org-level)
      const userOverrides = await overridesService.getUserActiveOverrides(
        userId
      );
      const orgOverrides =
        await overridesService.getOrganizationActiveOverrides(organizationId);

      // Step 7: Build base permissions from plan
      const basePermissions = {};
      planFeatures.forEach((feature) => {
        basePermissions[feature.slug] = feature.enabled;
      });

      // Step 8: Apply role permissions (union - roles can only grant, not deny)
      // Roles refine plan by granting additional permissions
      rolePermissions.forEach((slug) => {
        if (!(slug in basePermissions)) {
          basePermissions[slug] = true; // Role grants new permission
        }
        // If plan has feature disabled, role can enable it
        if (basePermissions[slug] === false) {
          basePermissions[slug] = true; // Role overrides plan disable
        }
      });

      // Step 9: Apply overrides (highest priority)
      // User-level overrides > org-level overrides
      const finalPermissions = { ...basePermissions };
      const finalLimits = { ...planLimitsMap };

      // Apply org-level overrides first
      orgOverrides.forEach((override) => {
        if (override.overrideType === "feature_enable") {
          finalPermissions[override.featureSlug] = true;
        } else if (override.overrideType === "feature_disable") {
          finalPermissions[override.featureSlug] = false;
        } else if (
          override.overrideType === "limit_increase" &&
          override.value !== null
        ) {
          finalLimits[override.featureSlug] = override.value;
        }
      });

      // Apply user-level overrides (highest priority)
      userOverrides.forEach((override) => {
        if (override.overrideType === "feature_enable") {
          finalPermissions[override.featureSlug] = true;
        } else if (override.overrideType === "feature_disable") {
          finalPermissions[override.featureSlug] = false;
        } else if (
          override.overrideType === "limit_increase" &&
          override.value !== null
        ) {
          finalLimits[override.featureSlug] = override.value;
        }
      });

      // Step 10: Load usage for all features with limits
      const usageMap = {};
      try {
        // Import usage service
        const usageServiceModule = await import("./usage.service.js");
        const usageService = usageServiceModule.default;

        if (usageService && typeof usageService.getUsage === "function") {
          // Get usage for all features with limits
          for (const featureSlug of Object.keys(finalLimits)) {
            try {
              const usage = await usageService.getUsage(userId, featureSlug);
              usageMap[featureSlug] = usage || 0;
            } catch (error) {
              logger.warn(
                { error, userId, featureSlug },
                "Failed to get usage, defaulting to 0"
              );
              usageMap[featureSlug] = 0;
            }
          }
        } else {
          // Usage service not fully implemented - default to 0
          Object.keys(finalLimits).forEach((featureSlug) => {
            usageMap[featureSlug] = 0;
          });
        }
      } catch (error) {
        // Usage service not available - default to 0
        logger.debug("Usage service not available, defaulting usage to 0");
        Object.keys(finalLimits).forEach((featureSlug) => {
          usageMap[featureSlug] = 0;
        });
      }

      // Step 11: Build PermissionMap
      const features = {};
      const limits = {};

      // Build features map
      Object.keys(finalPermissions).forEach((slug) => {
        features[slug] = finalPermissions[slug];
      });

      // Build limits map with usage
      Object.keys(finalLimits).forEach((slug) => {
        const max = finalLimits[slug];
        const used = usageMap[slug] || 0;
        limits[slug] = {
          max,
          used,
          remaining: Math.max(0, max - used),
        };
      });

      const permissionMap = {
        features,
        limits,
        resolvedAt: new Date().toISOString(),
      };

      // Cache for 5 minutes
      await cacheService.set(cacheKey, permissionMap, CACHE_TTL.PERMISSIONS);

      logger.debug(
        { userId, organizationId, featureCount: Object.keys(features).length },
        "Permissions resolved"
      );

      return permissionMap;
    } catch (error) {
      logger.error(
        { error, userId, organizationId },
        "Failed to resolve permissions"
      );
      throw error;
    }
  }

  /**
   * Check if user has permission for a specific feature
   * @param {number} userId - User ID (database ID)
   * @param {number} organizationId - Organization ID
   * @param {string} featureSlug - Feature slug
   * @returns {Promise<boolean>} True if user has permission
   */
  async hasPermission(userId, organizationId, featureSlug) {
    const permissions = await this.resolvePermissions(userId, organizationId);
    return permissions.features[featureSlug] === true;
  }

  /**
   * Get limit info for a specific feature
   * @param {number} userId - User ID (database ID)
   * @param {number} organizationId - Organization ID
   * @param {string} featureSlug - Feature slug
   * @returns {Promise<Object|null>} Limit info or null if unlimited
   */
  async getLimit(userId, organizationId, featureSlug) {
    const permissions = await this.resolvePermissions(userId, organizationId);
    return permissions.limits[featureSlug] || null;
  }
}

const permissionResolutionService = new PermissionResolutionService();
export default permissionResolutionService;
