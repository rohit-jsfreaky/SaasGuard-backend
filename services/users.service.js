import { eq, and, desc } from 'drizzle-orm';
import db from '../config/db.js';
import { users } from '../models/users.model.js';
import { organizations } from '../models/organizations.model.js';
import logger from '../utilities/logger.js';
import { NotFoundError, ConflictError, ValidationError } from '../utilities/errors.js';
import cacheService from './cache.service.js';
import cacheKeys from '../utilities/cache-keys.js';
import { CACHE_TTL } from '../utilities/cache-keys.js';

/**
 * UsersService - Handles all user-related database operations
 */
class UsersService {
  /**
   * Create or update user (idempotent)
   * Used for syncing users from Clerk
   * @param {string} clerkId - Clerk user ID (string)
   * @param {string} email - User email
   * @param {number} organizationId - Organization ID (optional)
   * @returns {Promise<Object>} User object
   */
  async createOrUpdateUser(clerkId, email, organizationId = null) {
    if (!clerkId || !email) {
      throw new ValidationError('clerkId and email are required');
    }

    try {
      // Check if user exists by clerkId
      const existingUser = await db
        .select()
        .from(users)
        .where(eq(users.clerkId, clerkId))
        .limit(1);

      if (existingUser.length > 0) {
        // User exists - update if needed
        const user = existingUser[0];
        const updates = {};

        // Update email if changed
        if (user.email !== email) {
          updates.email = email;
        }

        // Update organization if provided
        if (organizationId && user.organizationId !== organizationId) {
          updates.organizationId = organizationId;
        }

        // Update timestamp
        updates.updatedAt = new Date();

        if (Object.keys(updates).length > 0) {
          const [updated] = await db
            .update(users)
            .set(updates)
            .where(eq(users.id, user.id))
            .returning();

          // Invalidate cache
          await cacheService.del(cacheKeys.user(clerkId));

          logger.info({ userId: user.id, clerkId }, 'User updated');
          return this._formatUser(updated);
        }

        logger.debug({ userId: user.id, clerkId }, 'User already exists, no changes');
        return this._formatUser(user);
      }

      // User doesn't exist - create new
      // Check if email already exists (shouldn't happen, but safety check)
      const emailExists = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (emailExists.length > 0) {
        throw new ConflictError('User with this email already exists');
      }

      const [newUser] = await db
        .insert(users)
        .values({
          clerkId,
          email,
          organizationId
        })
        .returning();

      logger.info({ userId: newUser.id, clerkId, email }, 'User created');

      return this._formatUser(newUser);
    } catch (error) {
      logger.error({ error, clerkId, email }, 'Failed to create or update user');
      throw error;
    }
  }

  /**
   * Get user by database ID
   * No cache - always fresh
   * @param {number} userId - Database user ID
   * @returns {Promise<Object|null>} User object or null
   */
  async getUserById(userId) {
    if (!userId) {
      throw new ValidationError('User ID is required');
    }

    try {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        return null;
      }

      return this._formatUser(user);
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get user by ID');
      throw error;
    }
  }

  /**
   * Get user by Clerk ID
   * Cached for 30 minutes
   * @param {string} clerkId - Clerk user ID (string)
   * @returns {Promise<Object|null>} User object or null
   */
  async getUserByClerkId(clerkId) {
    if (!clerkId) {
      throw new ValidationError('Clerk ID is required');
    }

    // Check cache first
    const cacheKey = cacheKeys.user(clerkId);
    const cached = await cacheService.get(cacheKey);

    if (cached) {
      logger.debug({ clerkId }, 'User retrieved from cache');
      return cached;
    }

    try {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.clerkId, clerkId))
        .limit(1);

      if (!user) {
        return null;
      }

      const formatted = this._formatUser(user);

      // Cache for 30 minutes
      await cacheService.set(cacheKey, formatted, CACHE_TTL.USER_ROLES);

      return formatted;
    } catch (error) {
      logger.error({ error, clerkId }, 'Failed to get user by Clerk ID');
      
      // Provide helpful error message for database connection issues
      if (error.message?.includes('Connection') || error.message?.includes('timeout')) {
        throw new Error('Database connection failed. Please ensure PostgreSQL is running and DATABASE_URL is correct.');
      }
      
      throw error;
    }
  }

  /**
   * Get users by organization with pagination
   * @param {number} orgId - Organization ID
   * @param {number} limit - Page size (default: 50)
   * @param {number} offset - Offset for pagination (default: 0)
   * @returns {Promise<Object>} { users: [], total: number, hasMore: boolean }
   */
  async getUsersByOrganization(orgId, limit = 50, offset = 0) {
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

      const hasMore = offset + limit < total;

      return {
        users: userList.map(user => this._formatUser(user)),
        total,
        hasMore
      };
    } catch (error) {
      logger.error({ error, orgId }, 'Failed to get users by organization');
      throw error;
    }
  }

  /**
   * Update user details
   * @param {number} userId - Database user ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated user object
   */
  async updateUser(userId, updates) {
    if (!userId) {
      throw new ValidationError('User ID is required');
    }

    // Only allow updating specific fields
    const allowedFields = ['email', 'organizationId'];
    const filteredUpdates = {};

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        filteredUpdates[field] = updates[field];
      }
    }

    if (Object.keys(filteredUpdates).length === 0) {
      throw new ValidationError('No valid fields to update');
    }

    // Add updated timestamp
    filteredUpdates.updatedAt = new Date();

    try {
      // Get user first to get clerkId for cache invalidation
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!existingUser) {
        throw new NotFoundError('User not found');
      }

      // Check email uniqueness if updating email
      if (filteredUpdates.email && filteredUpdates.email !== existingUser.email) {
        const emailExists = await db
          .select()
          .from(users)
          .where(eq(users.email, filteredUpdates.email))
          .limit(1);

        if (emailExists.length > 0 && emailExists[0].id !== userId) {
          throw new ConflictError('Email already in use');
        }
      }

      // Update user
      const [updated] = await db
        .update(users)
        .set(filteredUpdates)
        .where(eq(users.id, userId))
        .returning();

      // Invalidate cache
      await cacheService.del(cacheKeys.user(existingUser.clerkId));

      logger.info({ userId, updates: filteredUpdates }, 'User updated');

      return this._formatUser(updated);
    } catch (error) {
      logger.error({ error, userId }, 'Failed to update user');
      throw error;
    }
  }

  /**
   * Delete user (hard delete)
   * @param {number} userId - Database user ID
   * @returns {Promise<void>}
   */
  async deleteUser(userId) {
    if (!userId) {
      throw new ValidationError('User ID is required');
    }

    try {
      // Get user first
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        throw new NotFoundError('User not found');
      }

      // TODO: Check if user has critical roles (will be implemented when roles are ready)
      // For now, allow deletion

      // Delete user
      await db
        .delete(users)
        .where(eq(users.id, userId));

      // Invalidate cache
      await cacheService.del(cacheKeys.user(user.clerkId));

      logger.info({ userId, clerkId: user.clerkId }, 'User deleted');
    } catch (error) {
      logger.error({ error, userId }, 'Failed to delete user');
      throw error;
    }
  }

  /**
   * Get user with organization details
   * @param {number} userId - Database user ID
   * @returns {Promise<Object>} User object with organization
   */
  async getUserWithOrganization(userId) {
    if (!userId) {
      throw new ValidationError('User ID is required');
    }

    try {
      const [user] = await db
        .select({
          id: users.id,
          clerkId: users.clerkId,
          email: users.email,
          organizationId: users.organizationId,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        throw new NotFoundError('User not found');
      }

      const formatted = this._formatUser(user);

      // Get organization if exists
      if (user.organizationId) {
        const [org] = await db
          .select({
            id: organizations.id,
            name: organizations.name,
            createdAt: organizations.createdAt
          })
          .from(organizations)
          .where(eq(organizations.id, user.organizationId))
          .limit(1);

        if (org) {
          formatted.organization = {
            id: org.id,
            name: org.name,
            createdAt: org.createdAt
          };
        }
      }

      return formatted;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get user with organization');
      throw error;
    }
  }

  /**
   * Format user object for API response
   * @private
   * @param {Object} user - Raw user from database
   * @returns {Object} Formatted user object
   */
  _formatUser(user) {
    return {
      id: user.id,
      clerkId: user.clerkId,
      email: user.email,
      organizationId: user.organizationId,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };
  }
}

// Create singleton instance
const usersService = new UsersService();

export default usersService;
