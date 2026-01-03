import { eq, and, inArray } from "drizzle-orm";
import db from "../config/db.js";
import { rolePermissions } from "../models/role-permissions.model.js";
import { userRoles } from "../models/user-roles.model.js";
import logger from "../utilities/logger.js";
import { NotFoundError, ValidationError } from "../utilities/errors.js";
import cacheService from "./cache.service.js";
import cacheKeys from "../utilities/cache-keys.js";
import { CACHE_TTL } from "../utilities/cache-keys.js";
import rolesService from "./roles.service.js";

/**
 * RolePermissionsService - Handles role permission management
 * Permissions are feature-based (using feature slugs)
 */
class RolePermissionsService {
  /**
   * Grant permission to role
   * Idempotent - safe to call multiple times
   * @param {number} roleId - Role ID
   * @param {string} featureSlug - Feature slug
   * @returns {Promise<void>}
   */
  async grantPermissionToRole(roleId, featureSlug) {
    if (!roleId) {
      throw new ValidationError("Role ID is required");
    }

    if (!featureSlug || featureSlug.trim().length === 0) {
      throw new ValidationError("Feature slug is required");
    }

    // Verify role exists
    const role = await rolesService.getRole(roleId);
    if (!role) {
      throw new NotFoundError("Role not found");
    }

    // Verify feature exists in this organization (import here to avoid circular dependency)
    const featuresService = (await import("./features.service.js")).default;
    const feature = await featuresService.getFeatureBySlug(
      role.organizationId,
      featureSlug
    );
    if (!feature) {
      throw new NotFoundError(`Feature with slug '${featureSlug}' not found`);
    }

    try {
      // Insert permission (idempotent - unique constraint handles duplicates)
      await db
        .insert(rolePermissions)
        .values({
          roleId,
          featureSlug: featureSlug.toLowerCase(),
          granted: true,
        })
        .onConflictDoNothing();

      // Invalidate cache
      await cacheService.del(cacheKeys.rolePermissions(roleId));

      // Invalidate permission caches for all users with this role
      await this._invalidateUserPermissionCachesForRole(
        roleId,
        role.organizationId
      );

      logger.info({ roleId, featureSlug }, "Permission granted to role");
    } catch (error) {
      logger.error(
        { error, roleId, featureSlug },
        "Failed to grant permission"
      );
      if (error.code !== "23505") {
        // Ignore unique constraint violations (idempotent)
        throw error;
      }
    }
  }

  /**
   * Revoke permission from role
   * @param {number} roleId - Role ID
   * @param {string} featureSlug - Feature slug
   * @returns {Promise<void>}
   */
  async revokePermissionFromRole(roleId, featureSlug) {
    if (!roleId) {
      throw new ValidationError("Role ID is required");
    }

    if (!featureSlug || featureSlug.trim().length === 0) {
      throw new ValidationError("Feature slug is required");
    }

    // Verify role exists
    const role = await rolesService.getRole(roleId);
    if (!role) {
      throw new NotFoundError("Role not found");
    }

    try {
      await db
        .delete(rolePermissions)
        .where(
          and(
            eq(rolePermissions.roleId, roleId),
            eq(rolePermissions.featureSlug, featureSlug.toLowerCase())
          )
        );

      // Invalidate cache
      await cacheService.del(cacheKeys.rolePermissions(roleId));

      // Invalidate permission caches for all users with this role
      await this._invalidateUserPermissionCachesForRole(
        roleId,
        role.organizationId
      );

      logger.info({ roleId, featureSlug }, "Permission revoked from role");
    } catch (error) {
      logger.error(
        { error, roleId, featureSlug },
        "Failed to revoke permission"
      );
      throw error;
    }
  }

  /**
   * Get all permissions for role
   * @param {number} roleId - Role ID
   * @returns {Promise<Array<string>>} Array of feature slugs
   */
  async getRolePermissions(roleId) {
    if (!roleId) {
      throw new ValidationError("Role ID is required");
    }

    const cacheKey = cacheKeys.rolePermissions(roleId);

    try {
      // Try cache first
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.debug({ roleId }, "Role permissions retrieved from cache");
        return cached;
      }

      const permissions = await db
        .select({
          featureSlug: rolePermissions.featureSlug,
        })
        .from(rolePermissions)
        .where(
          and(
            eq(rolePermissions.roleId, roleId),
            eq(rolePermissions.granted, true)
          )
        );

      const featureSlugs = permissions.map((p) => p.featureSlug);

      // Cache for 1 hour
      await cacheService.set(cacheKey, featureSlugs, CACHE_TTL.PLAN_ROLE_DATA);

      return featureSlugs;
    } catch (error) {
      logger.error({ error, roleId }, "Failed to get role permissions");
      throw error;
    }
  }

  /**
   * Check if role has permission
   * @param {number} roleId - Role ID
   * @param {string} featureSlug - Feature slug
   * @returns {Promise<boolean>}
   */
  async hasRolePermission(roleId, featureSlug) {
    if (!roleId || !featureSlug) {
      return false;
    }

    const cacheKey = `${cacheKeys.rolePermissions(
      roleId
    )}:check:${featureSlug}`;

    try {
      // Try cache first
      const cached = await cacheService.get(cacheKey);
      if (cached !== null) {
        return cached === true;
      }

      const [permission] = await db
        .select()
        .from(rolePermissions)
        .where(
          and(
            eq(rolePermissions.roleId, roleId),
            eq(rolePermissions.featureSlug, featureSlug.toLowerCase()),
            eq(rolePermissions.granted, true)
          )
        )
        .limit(1);

      const hasPermission = !!permission;

      // Cache for 1 hour
      await cacheService.set(cacheKey, hasPermission, CACHE_TTL.PLAN_ROLE_DATA);

      return hasPermission;
    } catch (error) {
      logger.error(
        { error, roleId, featureSlug },
        "Failed to check role permission"
      );
      return false;
    }
  }

  /**
   * Grant multiple permissions to role
   * @param {number} roleId - Role ID
   * @param {Array<string>} featureSlugs - Array of feature slugs
   * @returns {Promise<void>}
   */
  async grantMultiplePermissions(roleId, featureSlugs) {
    if (!roleId) {
      throw new ValidationError("Role ID is required");
    }

    if (!Array.isArray(featureSlugs) || featureSlugs.length === 0) {
      throw new ValidationError(
        "Feature slugs array is required and cannot be empty"
      );
    }

    // Verify role exists
    const role = await rolesService.getRole(roleId);
    if (!role) {
      throw new NotFoundError("Role not found");
    }

    // Verify all features exist in this organization
    const featuresService = (await import("./features.service.js")).default;
    for (const slug of featureSlugs) {
      const feature = await featuresService.getFeatureBySlug(
        role.organizationId,
        slug
      );
      if (!feature) {
        throw new NotFoundError(`Feature with slug '${slug}' not found`);
      }
    }

    try {
      // Insert multiple permissions
      const values = featureSlugs.map((slug) => ({
        roleId,
        featureSlug: slug.toLowerCase(),
        granted: true,
      }));

      await db.insert(rolePermissions).values(values).onConflictDoNothing();

      // Invalidate cache
      await cacheService.del(cacheKeys.rolePermissions(roleId));

      // Invalidate permission caches for all users with this role
      await this._invalidateUserPermissionCachesForRole(
        roleId,
        role.organizationId
      );

      logger.info(
        { roleId, count: featureSlugs.length },
        "Multiple permissions granted to role"
      );
    } catch (error) {
      logger.error(
        { error, roleId, featureSlugs },
        "Failed to grant multiple permissions"
      );
      throw error;
    }
  }

  /**
   * Revoke multiple permissions from role
   * @param {number} roleId - Role ID
   * @param {Array<string>} featureSlugs - Array of feature slugs
   * @returns {Promise<void>}
   */
  async revokeMultiplePermissions(roleId, featureSlugs) {
    if (!roleId) {
      throw new ValidationError("Role ID is required");
    }

    if (!Array.isArray(featureSlugs) || featureSlugs.length === 0) {
      throw new ValidationError(
        "Feature slugs array is required and cannot be empty"
      );
    }

    // Verify role exists
    const role = await rolesService.getRole(roleId);
    if (!role) {
      throw new NotFoundError("Role not found");
    }

    try {
      // Delete multiple permissions
      const normalizedSlugs = featureSlugs.map((slug) => slug.toLowerCase());

      await db
        .delete(rolePermissions)
        .where(
          and(
            eq(rolePermissions.roleId, roleId),
            inArray(rolePermissions.featureSlug, normalizedSlugs)
          )
        );

      // Invalidate cache
      await cacheService.del(cacheKeys.rolePermissions(roleId));

      // Invalidate permission caches for all users with this role
      await this._invalidateUserPermissionCachesForRole(
        roleId,
        role.organizationId
      );

      logger.info(
        { roleId, count: featureSlugs.length },
        "Multiple permissions revoked from role"
      );
    } catch (error) {
      logger.error(
        { error, roleId, featureSlugs },
        "Failed to revoke multiple permissions"
      );
      throw error;
    }
  }

  /**
   * Invalidate permission caches for all users with a specific role
   * @private
   * @param {number} roleId - Role ID
   * @param {number} organizationId - Organization ID
   */
  async _invalidateUserPermissionCachesForRole(roleId, organizationId) {
    try {
      // Find all users with this role
      const usersWithRole = await db
        .select({ userId: userRoles.userId })
        .from(userRoles)
        .where(
          and(
            eq(userRoles.roleId, roleId),
            eq(userRoles.organizationId, organizationId)
          )
        );

      // Invalidate each user's permission cache
      for (const { userId } of usersWithRole) {
        await cacheService.del(
          cacheKeys.userPermissions(String(userId), organizationId)
        );
      }

      if (usersWithRole.length > 0) {
        logger.info(
          { roleId, organizationId, userCount: usersWithRole.length },
          "Invalidated permission caches for users with role"
        );
      }
    } catch (error) {
      logger.error(
        { error, roleId, organizationId },
        "Failed to invalidate user permission caches for role"
      );
      // Don't throw - this is a best-effort cleanup
    }
  }
}

const rolePermissionsService = new RolePermissionsService();
export default rolePermissionsService;
