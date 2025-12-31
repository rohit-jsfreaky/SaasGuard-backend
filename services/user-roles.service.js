import { eq, and, inArray } from 'drizzle-orm';
import db from '../config/db.js';
import { userRoles } from '../models/user-roles.model.js';
import { roles } from '../models/roles.model.js';
import logger from '../utilities/logger.js';
import { NotFoundError, ValidationError } from '../utilities/errors.js';
import cacheService from './cache.service.js';
import cacheKeys from '../utilities/cache-keys.js';
import { CACHE_TTL } from '../utilities/cache-keys.js';
import usersService from './users.service.js';
import rolesService from './roles.service.js';
import rolePermissionsService from './role-permissions.service.js';

/**
 * UserRolesService - Handles user role assignments
 * Users can have multiple roles per organization
 */
class UserRolesService {
  /**
   * Assign role to user in organization
   * Idempotent - safe to call multiple times
   * @param {number} userId - User ID (database ID)
   * @param {number} roleId - Role ID
   * @param {number} organizationId - Organization ID
   * @returns {Promise<void>}
   */
  async assignRoleToUser(userId, roleId, organizationId) {
    if (!userId) {
      throw new ValidationError('User ID is required');
    }

    if (!roleId) {
      throw new ValidationError('Role ID is required');
    }

    if (!organizationId) {
      throw new ValidationError('Organization ID is required');
    }

    // Verify user exists
    const user = await usersService.getUserById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Verify role exists and belongs to organization
    const role = await rolesService.getRole(roleId);
    if (!role) {
      throw new NotFoundError('Role not found');
    }

    if (role.organizationId !== organizationId) {
      throw new ValidationError('Role does not belong to this organization');
    }

    try {
      // Insert user role assignment (idempotent - unique constraint handles duplicates)
      await db
        .insert(userRoles)
        .values({
          userId,
          roleId,
          organizationId
        })
        .onConflictDoNothing();

      // Invalidate user permission cache (convert to string for cache key)
      await cacheService.del(cacheKeys.userRoles(String(userId), organizationId));
      await cacheService.del(cacheKeys.userPermissions(String(userId), organizationId));

      logger.info({ userId, roleId, organizationId }, 'Role assigned to user');
    } catch (error) {
      logger.error({ error, userId, roleId, organizationId }, 'Failed to assign role to user');
      if (error.code !== '23505') { // Ignore unique constraint violations (idempotent)
        throw error;
      }
    }
  }

  /**
   * Remove role from user in organization
   * @param {number} userId - User ID (database ID)
   * @param {number} roleId - Role ID
   * @param {number} organizationId - Organization ID
   * @returns {Promise<void>}
   */
  async removeRoleFromUser(userId, roleId, organizationId) {
    if (!userId) {
      throw new ValidationError('User ID is required');
    }

    if (!roleId) {
      throw new ValidationError('Role ID is required');
    }

    if (!organizationId) {
      throw new ValidationError('Organization ID is required');
    }

    try {
      await db
        .delete(userRoles)
        .where(
          and(
            eq(userRoles.userId, userId),
            eq(userRoles.roleId, roleId),
            eq(userRoles.organizationId, organizationId)
          )
        );

      // Invalidate user permission cache (convert to string for cache key)
      await cacheService.del(cacheKeys.userRoles(String(userId), organizationId));
      await cacheService.del(cacheKeys.userPermissions(String(userId), organizationId));

      logger.info({ userId, roleId, organizationId }, 'Role removed from user');
    } catch (error) {
      logger.error({ error, userId, roleId, organizationId }, 'Failed to remove role from user');
      throw error;
    }
  }

  /**
   * Get all roles for user in organization
   * @param {number} userId - User ID (database ID)
   * @param {number} organizationId - Organization ID
   * @returns {Promise<Array<Object>>} Array of role objects
   */
  async getUserRoles(userId, organizationId) {
    if (!userId) {
      throw new ValidationError('User ID is required');
    }

    if (!organizationId) {
      throw new ValidationError('Organization ID is required');
    }

    // Cache key uses database user ID as string
    const cacheKey = cacheKeys.userRoles(String(userId), organizationId);

    try {
      // Try cache first
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.debug({ userId, organizationId }, 'User roles retrieved from cache');
        return cached;
      }

      const userRoleList = await db
        .select({
          id: roles.id,
          name: roles.name,
          slug: roles.slug,
          description: roles.description,
          organizationId: roles.organizationId,
          createdAt: roles.createdAt,
          updatedAt: roles.updatedAt,
          assignedAt: userRoles.createdAt
        })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .where(
          and(
            eq(userRoles.userId, userId),
            eq(userRoles.organizationId, organizationId)
          )
        );

      // Format roles
      const formattedRoles = userRoleList.map(role => ({
        id: role.id,
        name: role.name,
        slug: role.slug,
        description: role.description,
        organizationId: role.organizationId,
        createdAt: role.createdAt,
        updatedAt: role.updatedAt,
        assignedAt: role.assignedAt
      }));

      // Cache for 30 minutes
      await cacheService.set(cacheKey, formattedRoles, CACHE_TTL.USER_ROLES);

      return formattedRoles;
    } catch (error) {
      logger.error({ error, userId, organizationId }, 'Failed to get user roles');
      throw error;
    }
  }

  /**
   * Get all feature permissions user has through roles
   * Aggregates permissions from all assigned roles (union)
   * @param {number} userId - User ID (database ID)
   * @param {number} organizationId - Organization ID
   * @returns {Promise<Array<string>>} Array of feature slugs (unique)
   */
  async getUserRolePermissions(userId, organizationId) {
    if (!userId) {
      throw new ValidationError('User ID is required');
    }

    if (!organizationId) {
      throw new ValidationError('Organization ID is required');
    }

    // Cache key uses database user ID as string
    const cacheKey = cacheKeys.userPermissions(String(userId), organizationId);

    try {
      // Try cache first
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.debug({ userId, organizationId }, 'User permissions retrieved from cache');
        return cached;
      }

      // Get user's roles
      const userRoleList = await this.getUserRoles(userId, organizationId);

      // Get permissions from all roles
      const allPermissions = new Set();
      for (const role of userRoleList) {
        const permissions = await rolePermissionsService.getRolePermissions(role.id);
        permissions.forEach(slug => allPermissions.add(slug));
      }

      const permissionsArray = Array.from(allPermissions);

      // Cache for 30 minutes
      await cacheService.set(cacheKey, permissionsArray, CACHE_TTL.USER_ROLES);

      return permissionsArray;
    } catch (error) {
      logger.error({ error, userId, organizationId }, 'Failed to get user role permissions');
      throw error;
    }
  }

  /**
   * Check if user has specific role
   * @param {number} userId - User ID (database ID)
   * @param {number} organizationId - Organization ID
   * @param {number} roleId - Role ID
   * @returns {Promise<boolean>}
   */
  async userHasRole(userId, organizationId, roleId) {
    if (!userId || !organizationId || !roleId) {
      return false;
    }

    try {
      const [assignment] = await db
        .select()
        .from(userRoles)
        .where(
          and(
            eq(userRoles.userId, userId),
            eq(userRoles.roleId, roleId),
            eq(userRoles.organizationId, organizationId)
          )
        )
        .limit(1);

      return !!assignment;
    } catch (error) {
      logger.error({ error, userId, organizationId, roleId }, 'Failed to check user role');
      return false;
    }
  }

  /**
   * Check if user has permission through any role
   * @param {number} userId - User ID (database ID)
   * @param {number} organizationId - Organization ID
   * @param {string} featureSlug - Feature slug
   * @returns {Promise<boolean>}
   */
  async userHasPermission(userId, organizationId, featureSlug) {
    if (!userId || !organizationId || !featureSlug) {
      return false;
    }

    // Cache key uses database user ID as string
    const cacheKey = `${cacheKeys.userPermissions(String(userId), organizationId)}:check:${featureSlug}`;

    try {
      // Try cache first
      const cached = await cacheService.get(cacheKey);
      if (cached !== null) {
        return cached === true;
      }

      // Get user's roles
      const userRoleList = await this.getUserRoles(userId, organizationId);

      // Check if any role has this permission
      for (const role of userRoleList) {
        const hasPermission = await rolePermissionsService.hasRolePermission(role.id, featureSlug);
        if (hasPermission) {
          // Cache positive result for 30 minutes
          await cacheService.set(cacheKey, true, CACHE_TTL.USER_ROLES);
          return true;
        }
      }

      // Cache negative result for 30 minutes
      await cacheService.set(cacheKey, false, CACHE_TTL.USER_ROLES);
      return false;
    } catch (error) {
      logger.error({ error, userId, organizationId, featureSlug }, 'Failed to check user permission');
      return false;
    }
  }

  /**
   * Assign multiple roles to user
   * @param {number} userId - User ID (database ID)
   * @param {number} organizationId - Organization ID
   * @param {Array<number>} roleIds - Array of role IDs
   * @returns {Promise<void>}
   */
  async assignMultipleRoles(userId, organizationId, roleIds) {
    if (!userId) {
      throw new ValidationError('User ID is required');
    }

    if (!organizationId) {
      throw new ValidationError('Organization ID is required');
    }

    if (!Array.isArray(roleIds) || roleIds.length === 0) {
      throw new ValidationError('Role IDs array is required and cannot be empty');
    }

    // Verify user exists
    const user = await usersService.getUserById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Verify all roles exist and belong to organization
    for (const roleId of roleIds) {
      const role = await rolesService.getRole(roleId);
      if (!role) {
        throw new NotFoundError(`Role with ID ${roleId} not found`);
      }
      if (role.organizationId !== organizationId) {
        throw new ValidationError(`Role with ID ${roleId} does not belong to this organization`);
      }
    }

    try {
      // Insert multiple role assignments
      const values = roleIds.map(roleId => ({
        userId,
        roleId,
        organizationId
      }));

      await db
        .insert(userRoles)
        .values(values)
        .onConflictDoNothing();

      // Invalidate user permission cache (convert to string for cache key)
      await cacheService.del(cacheKeys.userRoles(String(userId), organizationId));
      await cacheService.del(cacheKeys.userPermissions(String(userId), organizationId));

      logger.info({ userId, organizationId, count: roleIds.length }, 'Multiple roles assigned to user');
    } catch (error) {
      logger.error({ error, userId, organizationId, roleIds }, 'Failed to assign multiple roles');
      throw error;
    }
  }

  /**
   * Remove all roles from user in organization
   * @param {number} userId - User ID (database ID)
   * @param {number} organizationId - Organization ID
   * @returns {Promise<void>}
   */
  async removeAllRoles(userId, organizationId) {
    if (!userId) {
      throw new ValidationError('User ID is required');
    }

    if (!organizationId) {
      throw new ValidationError('Organization ID is required');
    }

    try {
      await db
        .delete(userRoles)
        .where(
          and(
            eq(userRoles.userId, userId),
            eq(userRoles.organizationId, organizationId)
          )
        );

      // Invalidate user permission cache (convert to string for cache key)
      await cacheService.del(cacheKeys.userRoles(String(userId), organizationId));
      await cacheService.del(cacheKeys.userPermissions(String(userId), organizationId));

      logger.info({ userId, organizationId }, 'All roles removed from user');
    } catch (error) {
      logger.error({ error, userId, organizationId }, 'Failed to remove all roles from user');
      throw error;
    }
  }
}

const userRolesService = new UserRolesService();
export default userRolesService;

