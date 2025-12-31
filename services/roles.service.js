import { eq, and, desc, sql } from 'drizzle-orm';
import db from '../config/db.js';
import { roles } from '../models/roles.model.js';
import { userRoles } from '../models/user-roles.model.js';
import { rolePermissions } from '../models/role-permissions.model.js';
import logger from '../utilities/logger.js';
import { NotFoundError, ValidationError, ConflictError } from '../utilities/errors.js';
import cacheService from './cache.service.js';
import cacheKeys from '../utilities/cache-keys.js';
import { CACHE_TTL } from '../utilities/cache-keys.js';

/**
 * RolesService - Handles all role-related database operations
 * Roles are organization-scoped
 */
class RolesService {
  /**
   * Create new role
   * @param {number} organizationId - Organization ID
   * @param {string} name - Role name
   * @param {string} slug - Role slug (unique within organization)
   * @param {string|null} description - Role description (optional)
   * @returns {Promise<Object>} Role object
   */
  async createRole(organizationId, name, slug, description = null) {
    if (!organizationId) {
      throw new ValidationError('Organization ID is required');
    }

    if (!name || name.trim().length === 0) {
      throw new ValidationError('Role name is required');
    }

    if (!slug || slug.trim().length === 0) {
      throw new ValidationError('Role slug is required');
    }

    // Validate slug format: lowercase, alphanumeric, hyphens
    const slugRegex = /^[a-z0-9-]+$/;
    if (!slugRegex.test(slug)) {
      throw new ValidationError('Slug must be lowercase, alphanumeric, and can contain hyphens');
    }

    // Check if slug already exists in organization
    const existing = await this.roleExistsBySlug(organizationId, slug);
    if (existing) {
      throw new ConflictError(`Role with slug '${slug}' already exists in this organization`);
    }

    try {
      const [newRole] = await db
        .insert(roles)
        .values({
          name: name.trim(),
          slug: slug.trim().toLowerCase(),
          description: description ? description.trim() : null,
          organizationId
        })
        .returning();

      logger.info({ roleId: newRole.id, organizationId, slug }, 'Role created');

      return this._formatRole(newRole);
    } catch (error) {
      logger.error({ error, organizationId, slug }, 'Failed to create role');
      if (error.code === '23505') { // Unique constraint violation
        throw new ConflictError(`Role with slug '${slug}' already exists in this organization`);
      }
      throw error;
    }
  }

  /**
   * Get role by ID
   * @param {number} roleId - Role ID
   * @returns {Promise<Object|null>} Role object or null if not found
   */
  async getRole(roleId) {
    if (!roleId) {
      throw new ValidationError('Role ID is required');
    }

    const cacheKey = cacheKeys.role(roleId);

    try {
      // Try cache first
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.debug({ roleId }, 'Role retrieved from cache');
        return cached;
      }

      const [role] = await db
        .select()
        .from(roles)
        .where(eq(roles.id, roleId))
        .limit(1);

      if (!role) {
        return null;
      }

      const formatted = this._formatRole(role);

      // Cache for 1 hour
      await cacheService.set(cacheKey, formatted, CACHE_TTL.PLAN_ROLE_DATA);

      return formatted;
    } catch (error) {
      logger.error({ error, roleId }, 'Failed to get role');
      throw error;
    }
  }

  /**
   * Get all roles for organization
   * @param {number} orgId - Organization ID
   * @param {number} limit - Page size (default: 50)
   * @param {number} offset - Offset for pagination (default: 0)
   * @returns {Promise<Object>} { roles: [], total: number }
   */
  async getRolesByOrganization(orgId, limit = 50, offset = 0) {
    if (!orgId) {
      throw new ValidationError('Organization ID is required');
    }

    try {
      // Get total count
      const totalResult = await db
        .select({ count: sql`count(*)` })
        .from(roles)
        .where(eq(roles.organizationId, orgId));

      const total = parseInt(totalResult[0]?.count || 0, 10);

      // Get paginated roles
      const roleList = await db
        .select()
        .from(roles)
        .where(eq(roles.organizationId, orgId))
        .orderBy(desc(roles.createdAt))
        .limit(limit)
        .offset(offset);

      // Get permissions count for each role
      const rolesWithCounts = await Promise.all(
        roleList.map(async (role) => {
          const permissionsCount = await db
            .select({ count: sql`count(*)` })
            .from(rolePermissions)
            .where(
              and(
                eq(rolePermissions.roleId, role.id),
                eq(rolePermissions.granted, true)
              )
            );

          const count = parseInt(permissionsCount[0]?.count || 0, 10);
          
          return {
            ...this._formatRole(role),
            permissionsCount: count
          };
        })
      );

      return {
        roles: rolesWithCounts,
        total,
        limit,
        offset,
        hasMore: offset + limit < total
      };
    } catch (error) {
      logger.error({ error, orgId }, 'Failed to get roles by organization');
      throw error;
    }
  }

  /**
   * Update role
   * Slug is immutable
   * @param {number} roleId - Role ID
   * @param {Object} updates - Updates object { name?, description? }
   * @returns {Promise<Object>} Updated role object
   */
  async updateRole(roleId, updates) {
    if (!roleId) {
      throw new ValidationError('Role ID is required');
    }

    // Check if role exists
    const existing = await this.getRole(roleId);
    if (!existing) {
      throw new NotFoundError('Role not found');
    }

    // Build update object
    const updateData = {
      updatedAt: new Date()
    };

    if (updates.name !== undefined) {
      if (!updates.name || updates.name.trim().length === 0) {
        throw new ValidationError('Role name cannot be empty');
      }
      updateData.name = updates.name.trim();
    }

    if (updates.description !== undefined) {
      updateData.description = updates.description ? updates.description.trim() : null;
    }

    // Don't allow slug updates
    if (updates.slug !== undefined) {
      throw new ValidationError('Role slug is immutable');
    }

    try {
      const [updated] = await db
        .update(roles)
        .set(updateData)
        .where(eq(roles.id, roleId))
        .returning();

      // Invalidate cache
      await cacheService.del(cacheKeys.role(roleId));
      await cacheService.del(cacheKeys.rolePermissions(roleId));

      logger.info({ roleId }, 'Role updated');

      return this._formatRole(updated);
    } catch (error) {
      logger.error({ error, roleId }, 'Failed to update role');
      throw error;
    }
  }

  /**
   * Delete role
   * Checks if users are assigned this role before deletion
   * @param {number} roleId - Role ID
   * @returns {Promise<void>}
   */
  async deleteRole(roleId) {
    if (!roleId) {
      throw new ValidationError('Role ID is required');
    }

    // Check if role exists
    const role = await this.getRole(roleId);
    if (!role) {
      throw new NotFoundError('Role not found');
    }

    // Check if users are assigned this role
    const usersWithRole = await db
      .select()
      .from(userRoles)
      .where(eq(userRoles.roleId, roleId))
      .limit(1);

    if (usersWithRole.length > 0) {
      throw new ConflictError('Cannot delete role that is assigned to users. Remove all assignments first.');
    }

    try {
      await db
        .delete(roles)
        .where(eq(roles.id, roleId));

      // Invalidate cache
      await cacheService.del(cacheKeys.role(roleId));
      await cacheService.del(cacheKeys.rolePermissions(roleId));

      logger.info({ roleId }, 'Role deleted');
    } catch (error) {
      logger.error({ error, roleId }, 'Failed to delete role');
      throw error;
    }
  }

  /**
   * Get role with permissions
   * @param {number} roleId - Role ID
   * @returns {Promise<Object>} Role object with permissions array
   */
  async getRoleWithPermissions(roleId) {
    const role = await this.getRole(roleId);
    if (!role) {
      throw new NotFoundError('Role not found');
    }

    // Import here to avoid circular dependency
    const rolePermissionsService = (await import('./role-permissions.service.js')).default;
    const permissions = await rolePermissionsService.getRolePermissions(roleId);

    return {
      ...role,
      permissions
    };
  }

  /**
   * Check if role exists by slug in organization
   * @param {number} organizationId - Organization ID
   * @param {string} slug - Role slug
   * @returns {Promise<boolean>}
   */
  async roleExistsBySlug(organizationId, slug) {
    try {
      const [existing] = await db
        .select()
        .from(roles)
        .where(
          and(
            eq(roles.organizationId, organizationId),
            eq(roles.slug, slug.toLowerCase())
          )
        )
        .limit(1);

      return !!existing;
    } catch (error) {
      logger.error({ error, organizationId, slug }, 'Failed to check role existence');
      return false;
    }
  }

  /**
   * Format role object for API response
   * @private
   * @param {Object} role - Raw role from database
   * @returns {Object} Formatted role object
   */
  _formatRole(role) {
    return {
      id: role.id,
      name: role.name,
      slug: role.slug,
      description: role.description,
      organizationId: role.organizationId,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt
    };
  }
}

const rolesService = new RolesService();
export default rolesService;
