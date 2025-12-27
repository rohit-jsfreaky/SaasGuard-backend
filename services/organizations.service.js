import { eq, ilike, desc } from 'drizzle-orm';
import db from '../config/db.js';
import { organizations } from '../models/organizations.model.js';
import { users } from '../models/users.model.js';
import logger from '../utilities/logger.js';
import { NotFoundError, ValidationError, ConflictError } from '../utilities/errors.js';
import cacheService from './cache.service.js';
import cacheKeys from '../utilities/cache-keys.js';
import { CACHE_TTL } from '../utilities/cache-keys.js';
import usersService from './users.service.js';

/**
 * OrganizationsService - Handles all organization-related database operations
 */
class OrganizationsService {
  /**
   * Create new organization
   * @param {string} name - Organization name
   * @param {number} createdBy - User ID who created the organization
   * @returns {Promise<Object>} Organization object
   */
  async createOrganization(name, createdBy) {
    if (!name || name.trim().length === 0) {
      throw new ValidationError('Organization name is required');
    }

    if (!createdBy) {
      throw new ValidationError('createdBy user ID is required');
    }

    try {
      // Check if user exists
      const user = await usersService.getUserById(createdBy);
      if (!user) {
        throw new NotFoundError('User not found');
      }

      // Create organization
      const [newOrg] = await db
        .insert(organizations)
        .values({
          name: name.trim(),
          createdBy
        })
        .returning();

      logger.info({ orgId: newOrg.id, name, createdBy }, 'Organization created');

      // Add creator to organization
      await this.addUserToOrganization(createdBy, newOrg.id);

      return this._formatOrganization(newOrg);
    } catch (error) {
      logger.error({ error, name, createdBy }, 'Failed to create organization');
      throw error;
    }
  }

  /**
   * Get organization by ID
   * Cached for 1 hour
   * @param {number} orgId - Organization ID
   * @returns {Promise<Object|null>} Organization object or null
   */
  async getOrganization(orgId) {
    if (!orgId) {
      throw new ValidationError('Organization ID is required');
    }

    // Check cache first
    const cacheKey = cacheKeys.organization(orgId);
    const cached = await cacheService.get(cacheKey);

    if (cached) {
      logger.debug({ orgId }, 'Organization retrieved from cache');
      return cached;
    }

    try {
      const [org] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .limit(1);

      if (!org) {
        return null;
      }

      const formatted = this._formatOrganization(org);

      // Cache for 1 hour
      await cacheService.set(cacheKey, formatted, CACHE_TTL.PLAN_ROLE_DATA);

      return formatted;
    } catch (error) {
      logger.error({ error, orgId }, 'Failed to get organization');
      throw error;
    }
  }

  /**
   * Get organization by name (case-insensitive)
   * @param {string} name - Organization name
   * @returns {Promise<Object|null>} Organization object or null
   */
  async getOrganizationByName(name) {
    if (!name || name.trim().length === 0) {
      throw new ValidationError('Organization name is required');
    }

    try {
      const [org] = await db
        .select()
        .from(organizations)
        .where(ilike(organizations.name, name.trim()))
        .limit(1);

      if (!org) {
        return null;
      }

      return this._formatOrganization(org);
    } catch (error) {
      logger.error({ error, name }, 'Failed to get organization by name');
      throw error;
    }
  }

  /**
   * Update organization
   * @param {number} orgId - Organization ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated organization object
   */
  async updateOrganization(orgId, updates) {
    if (!orgId) {
      throw new ValidationError('Organization ID is required');
    }

    // Only allow updating specific fields
    const allowedFields = ['name'];
    const filteredUpdates = {};

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        if (field === 'name' && (!updates[field] || updates[field].trim().length === 0)) {
          throw new ValidationError('Organization name cannot be empty');
        }
        filteredUpdates[field] = updates[field]?.trim();
      }
    }

    if (Object.keys(filteredUpdates).length === 0) {
      throw new ValidationError('No valid fields to update');
    }

    // Add updated timestamp
    filteredUpdates.updatedAt = new Date();

    try {
      // Get organization first
      const [existingOrg] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .limit(1);

      if (!existingOrg) {
        throw new NotFoundError('Organization not found');
      }

      // Update organization
      const [updated] = await db
        .update(organizations)
        .set(filteredUpdates)
        .where(eq(organizations.id, orgId))
        .returning();

      // Invalidate cache
      await cacheService.del(cacheKeys.organization(orgId));

      logger.info({ orgId, updates: filteredUpdates }, 'Organization updated');

      return this._formatOrganization(updated);
    } catch (error) {
      logger.error({ error, orgId }, 'Failed to update organization');
      throw error;
    }
  }

  /**
   * Delete organization
   * @param {number} orgId - Organization ID
   * @returns {Promise<void>}
   */
  async deleteOrganization(orgId) {
    if (!orgId) {
      throw new ValidationError('Organization ID is required');
    }

    try {
      // Check if organization exists
      const org = await this.getOrganization(orgId);
      if (!org) {
        throw new NotFoundError('Organization not found');
      }

      // Check if organization has users
      const orgUsers = await this.getOrganizationUsers(orgId, 1, 0);
      if (orgUsers.total > 0) {
        throw new ConflictError('Cannot delete organization with existing users');
      }

      // Delete organization
      await db
        .delete(organizations)
        .where(eq(organizations.id, orgId));

      // Invalidate cache
      await cacheService.del(cacheKeys.organization(orgId));

      logger.info({ orgId }, 'Organization deleted');
    } catch (error) {
      logger.error({ error, orgId }, 'Failed to delete organization');
      throw error;
    }
  }

  /**
   * Get all users in organization with pagination
   * @param {number} orgId - Organization ID
   * @param {number} limit - Page size (default: 50)
   * @param {number} offset - Offset for pagination (default: 0)
   * @returns {Promise<Object>} { users: [], total: number }
   */
  async getOrganizationUsers(orgId, limit = 50, offset = 0) {
    if (!orgId) {
      throw new ValidationError('Organization ID is required');
    }

    try {
      // Get total count
      const totalResult = await db
        .select({ count: users.id })
        .from(users)
        .where(eq(users.organizationId, orgId));

      const total = totalResult.length;

      // Get paginated users
      const userList = await db
        .select()
        .from(users)
        .where(eq(users.organizationId, orgId))
        .orderBy(desc(users.createdAt))
        .limit(limit)
        .offset(offset);

      return {
        users: userList.map(user => ({
          id: user.id,
          clerkId: user.clerkId,
          email: user.email,
          organizationId: user.organizationId,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt
        })),
        total
      };
    } catch (error) {
      logger.error({ error, orgId }, 'Failed to get organization users');
      throw error;
    }
  }

  /**
   * Add user to organization
   * Idempotent - safe to call multiple times
   * @param {number} userId - User ID (database ID)
   * @param {number} orgId - Organization ID
   * @returns {Promise<void>}
   */
  async addUserToOrganization(userId, orgId) {
    if (!userId || !orgId) {
      throw new ValidationError('User ID and Organization ID are required');
    }

    try {
      // Check if organization exists
      const org = await this.getOrganization(orgId);
      if (!org) {
        throw new NotFoundError('Organization not found');
      }

      // Check if user exists
      const user = await usersService.getUserById(userId);
      if (!user) {
        throw new NotFoundError('User not found');
      }

      // Update user's organizationId (idempotent)
      await db
        .update(users)
        .set({
          organizationId: orgId,
          updatedAt: new Date()
        })
        .where(eq(users.id, userId));

      // Invalidate user cache
      await cacheService.del(cacheKeys.user(user.clerkId));

      logger.info({ userId, orgId }, 'User added to organization');
    } catch (error) {
      logger.error({ error, userId, orgId }, 'Failed to add user to organization');
      throw error;
    }
  }

  /**
   * Remove user from organization
   * @param {number} userId - User ID (database ID)
   * @param {number} orgId - Organization ID
   * @returns {Promise<void>}
   */
  async removeUserFromOrganization(userId, orgId) {
    if (!userId || !orgId) {
      throw new ValidationError('User ID and Organization ID are required');
    }

    try {
      // Check if user is in organization
      const user = await usersService.getUserById(userId);
      if (!user) {
        throw new NotFoundError('User not found');
      }

      if (user.organizationId !== orgId) {
        throw new ValidationError('User is not in this organization');
      }

      // TODO: Check for dependencies (roles, assignments) - will be implemented when roles are ready
      // For now, allow removal

      // Remove user from organization (set organizationId to null)
      await db
        .update(users)
        .set({
          organizationId: null,
          updatedAt: new Date()
        })
        .where(eq(users.id, userId));

      // Invalidate user cache
      await cacheService.del(cacheKeys.user(user.clerkId));

      logger.info({ userId, orgId }, 'User removed from organization');
    } catch (error) {
      logger.error({ error, userId, orgId }, 'Failed to remove user from organization');
      throw error;
    }
  }

  /**
   * Get all organizations user belongs to
   * @param {number} userId - User ID (database ID)
   * @returns {Promise<Array>} Array of organization objects
   */
  async getUserOrganizations(userId) {
    if (!userId) {
      throw new ValidationError('User ID is required');
    }

    try {
      // Get user's current organization
      const user = await usersService.getUserById(userId);
      if (!user) {
        throw new NotFoundError('User not found');
      }

      const orgs = [];

      // If user has an organization, get it
      if (user.organizationId) {
        const org = await this.getOrganization(user.organizationId);
        if (org) {
          orgs.push(org);
        }
      }

      // TODO: Support multiple organizations per user (future expansion)
      // For now, users belong to one organization

      return orgs;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get user organizations');
      throw error;
    }
  }

  /**
   * Check if user belongs to organization
   * @param {number} userId - User ID (database ID)
   * @param {number} orgId - Organization ID
   * @returns {Promise<boolean>}
   */
  async userBelongsToOrganization(userId, orgId) {
    try {
      const user = await usersService.getUserById(userId);
      return user?.organizationId === orgId;
    } catch (error) {
      logger.error({ error, userId, orgId }, 'Failed to check user organization membership');
      return false;
    }
  }

  /**
   * Format organization object for API response
   * @private
   * @param {Object} org - Raw organization from database
   * @returns {Object} Formatted organization object
   */
  _formatOrganization(org) {
    return {
      id: org.id,
      name: org.name,
      createdBy: org.createdBy,
      createdAt: org.createdAt,
      updatedAt: org.updatedAt
    };
  }
}

// Create singleton instance
const organizationsService = new OrganizationsService();

export default organizationsService;
