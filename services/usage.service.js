import { eq, and, inArray, sql } from 'drizzle-orm';
import db from '../config/db.js';
import { usage } from '../models/usage.model.js';
import logger from '../utilities/logger.js';
import { NotFoundError, ValidationError } from '../utilities/errors.js';
import cacheService from './cache.service.js';
import cacheKeys from '../utilities/cache-keys.js';
import { CACHE_TTL } from '../utilities/cache-keys.js';
import usersService from './users.service.js';

/**
 * UsageService - Handles usage tracking for limited features
 * Usage is per-user per-feature
 * Used for enforcing plan limits
 */
class UsageService {
  /**
   * Record usage (increment counter)
   * Atomic increment operation
   * @param {number} userId - User ID (database ID)
   * @param {string} featureSlug - Feature slug
   * @param {number} amount - Amount to increment (default: 1)
   * @returns {Promise<Object>} Updated usage object
   */
  async recordUsage(userId, featureSlug, amount = 1) {
    if (!userId) {
      throw new ValidationError('User ID is required');
    }

    if (!featureSlug || featureSlug.trim().length === 0) {
      throw new ValidationError('Feature slug is required');
    }

    if (amount <= 0) {
      throw new ValidationError('Amount must be positive');
    }

    // Verify user exists
    const user = await usersService.getUserById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    try {
      // Use PostgreSQL's atomic increment (upsert)
      const [result] = await db
        .insert(usage)
        .values({
          userId,
          featureSlug: featureSlug.toLowerCase(),
          currentUsage: amount
        })
        .onConflictDoUpdate({
          target: [usage.userId, usage.featureSlug],
          set: {
            currentUsage: sql`${usage.currentUsage} + ${amount}`,
            updatedAt: new Date()
          }
        })
        .returning();

      // Invalidate caches
      await this._invalidateCaches(userId, featureSlug);

      logger.info({ userId, featureSlug, amount, newUsage: result.currentUsage }, 'Usage recorded');

      return this._formatUsage(result);
    } catch (error) {
      logger.error({ error, userId, featureSlug, amount }, 'Failed to record usage');
      throw error;
    }
  }

  /**
   * Get current usage for user + feature
   * @param {number} userId - User ID (database ID)
   * @param {string} featureSlug - Feature slug
   * @returns {Promise<number>} Usage count (0 if not found)
   */
  async getUsage(userId, featureSlug) {
    if (!userId || !featureSlug) {
      return 0;
    }

    const cacheKey = cacheKeys.userUsageForFeature(String(userId), featureSlug);

    try {
      // Try cache first
      const cached = await cacheService.get(cacheKey);
      if (cached !== null) {
        logger.debug({ userId, featureSlug }, 'Usage retrieved from cache');
        return cached;
      }

      const [usageRecord] = await db
        .select()
        .from(usage)
        .where(
          and(
            eq(usage.userId, userId),
            eq(usage.featureSlug, featureSlug.toLowerCase())
          )
        )
        .limit(1);

      const usageCount = usageRecord ? usageRecord.currentUsage : 0;

      // Cache for 5 minutes
      await cacheService.set(cacheKey, usageCount, CACHE_TTL.USAGE);

      return usageCount;
    } catch (error) {
      logger.error({ error, userId, featureSlug }, 'Failed to get usage');
      return 0;
    }
  }

  /**
   * Get all usage records for a user
   * @param {number} userId - User ID (database ID)
   * @returns {Promise<Array>} Array of usage records
   */
  async getUserUsage(userId) {
    if (!userId) {
      throw new ValidationError('User ID is required');
    }

    try {
      const usageRecords = await db
        .select()
        .from(usage)
        .where(eq(usage.userId, userId))
        .orderBy(usage.featureSlug);

      return usageRecords.map(record => ({
        featureSlug: record.featureSlug,
        currentUsage: record.currentUsage,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt
      }));
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get user usage');
      throw error;
    }
  }

  /**
   * Reset usage counter to 0 for specific feature
   * @param {number} userId - User ID (database ID)
   * @param {string} featureSlug - Feature slug
   * @returns {Promise<void>}
   */
  async resetUsage(userId, featureSlug) {
    if (!userId || !featureSlug) {
      throw new ValidationError('User ID and feature slug are required');
    }

    try {
      await db
        .update(usage)
        .set({
          currentUsage: 0,
          updatedAt: new Date()
        })
        .where(
          and(
            eq(usage.userId, userId),
            eq(usage.featureSlug, featureSlug.toLowerCase())
          )
        );

      // Invalidate caches
      await this._invalidateCaches(userId, featureSlug);

      logger.info({ userId, featureSlug }, 'Usage reset');
    } catch (error) {
      logger.error({ error, userId, featureSlug }, 'Failed to reset usage');
      throw error;
    }
  }

  /**
   * Reset all usage for user
   * @param {number} userId - User ID (database ID)
   * @returns {Promise<number>} Count of reset features
   */
  async resetAllUsageForUser(userId) {
    if (!userId) {
      throw new ValidationError('User ID is required');
    }

    try {
      const result = await db
        .update(usage)
        .set({
          currentUsage: 0,
          updatedAt: new Date()
        })
        .where(eq(usage.userId, userId))
        .returning();

      // Invalidate all user usage caches
      await cacheService.del(cacheKeys.userUsage(String(userId)));

      logger.info({ userId, count: result.length }, 'All usage reset for user');

      return result.length;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to reset all usage for user');
      throw error;
    }
  }

  /**
   * Batch lookup usage for multiple users
   * @param {Array<number>} userIds - Array of user IDs
   * @param {string} featureSlug - Feature slug
   * @returns {Promise<Object>} Map of userId -> usage
   */
  async bulkGetUsage(userIds, featureSlug) {
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return {};
    }

    if (!featureSlug) {
      throw new ValidationError('Feature slug is required');
    }

    try {
      const usageRecords = await db
        .select()
        .from(usage)
        .where(
          and(
            inArray(usage.userId, userIds),
            eq(usage.featureSlug, featureSlug.toLowerCase())
          )
        );

      const usageMap = {};
      userIds.forEach(userId => {
        const record = usageRecords.find(r => r.userId === userId);
        usageMap[userId] = record ? record.currentUsage : 0;
      });

      return usageMap;
    } catch (error) {
      logger.error({ error, userIds, featureSlug }, 'Failed to bulk get usage');
      return {};
    }
  }

  /**
   * Increment usage by amount
   * Alias for recordUsage
   * @param {number} userId - User ID (database ID)
   * @param {string} featureSlug - Feature slug
   * @param {number} amount - Amount to increment (default: 1)
   * @returns {Promise<Object>} Updated usage object
   */
  async incrementUsage(userId, featureSlug, amount = 1) {
    return this.recordUsage(userId, featureSlug, amount);
  }

  /**
   * Set usage to exact amount
   * @param {number} userId - User ID (database ID)
   * @param {string} featureSlug - Feature slug
   * @param {number} amount - Exact amount to set
   * @returns {Promise<Object>} Updated usage object
   */
  async setUsage(userId, featureSlug, amount) {
    if (!userId) {
      throw new ValidationError('User ID is required');
    }

    if (!featureSlug || featureSlug.trim().length === 0) {
      throw new ValidationError('Feature slug is required');
    }

    if (amount < 0) {
      throw new ValidationError('Amount must be non-negative');
    }

    try {
      const [result] = await db
        .insert(usage)
        .values({
          userId,
          featureSlug: featureSlug.toLowerCase(),
          currentUsage: amount
        })
        .onConflictDoUpdate({
          target: [usage.userId, usage.featureSlug],
          set: {
            currentUsage: amount,
            updatedAt: new Date()
          }
        })
        .returning();

      // Invalidate caches
      await this._invalidateCaches(userId, featureSlug);

      logger.info({ userId, featureSlug, amount }, 'Usage set');

      return this._formatUsage(result);
    } catch (error) {
      logger.error({ error, userId, featureSlug, amount }, 'Failed to set usage');
      throw error;
    }
  }

  /**
   * Get usage stats for feature across all users
   * @param {string} featureSlug - Feature slug
   * @returns {Promise<Object>} Usage statistics
   */
  async getUsageByFeature(featureSlug) {
    if (!featureSlug) {
      throw new ValidationError('Feature slug is required');
    }

    const cacheKey = `usage:feature:${featureSlug}`;

    try {
      // Try cache first
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.debug({ featureSlug }, 'Feature usage stats retrieved from cache');
        return cached;
      }

      const usageRecords = await db
        .select()
        .from(usage)
        .where(eq(usage.featureSlug, featureSlug.toLowerCase()));

      const totalUsage = usageRecords.reduce((sum, record) => sum + record.currentUsage, 0);
      const usersUsingIt = usageRecords.length;
      const averageUsage = usersUsingIt > 0 ? Math.round(totalUsage / usersUsingIt) : 0;
      const maxUsage = usageRecords.length > 0
        ? Math.max(...usageRecords.map(r => r.currentUsage))
        : 0;

      const stats = {
        totalUsage,
        averageUsage,
        maxUsage,
        usersUsingIt
      };

      // Cache for 1 hour
      await cacheService.set(cacheKey, stats, CACHE_TTL.PLAN_ROLE_DATA);

      return stats;
    } catch (error) {
      logger.error({ error, featureSlug }, 'Failed to get usage by feature');
      throw error;
    }
  }

  /**
   * Get user's usage for features in organization
   * Includes limits from plan
   * @param {number} userId - User ID (database ID)
   * @param {number} organizationId - Organization ID
   * @returns {Promise<Array>} Array of usage with limits
   */
  async getUserUsageForOrganization(userId, organizationId) {
    if (!userId || !organizationId) {
      throw new ValidationError('User ID and Organization ID are required');
    }

    try {
      // Get user's plan
      const userPlansService = (await import('./user-plans.service.js')).default;
      const userPlan = await userPlansService.getUserPlan(userId, organizationId);

      if (!userPlan) {
        // User has no plan - return empty array
        return [];
      }

      // Get plan limits
      const planLimitsService = (await import('./plan-limits.service.js')).default;
      const planLimits = await planLimitsService.getPlanLimits(userPlan.planId);

      // Get user's usage for all features with limits
      const usageRecords = await db
        .select()
        .from(usage)
        .where(eq(usage.userId, userId));

      // Combine limits with usage
      const result = planLimits.map(limit => {
        const usageRecord = usageRecords.find(
          r => r.featureSlug === limit.featureSlug.toLowerCase()
        );
        return {
          featureSlug: limit.featureSlug,
          currentUsage: usageRecord ? usageRecord.currentUsage : 0,
          limit: limit.maxLimit
        };
      });

      return result;
    } catch (error) {
      logger.error({ error, userId, organizationId }, 'Failed to get user usage for organization');
      throw error;
    }
  }

  /**
   * Invalidate usage caches
   * @private
   * @param {number} userId - User ID
   * @param {string} featureSlug - Feature slug
   */
  async _invalidateCaches(userId, featureSlug) {
    await cacheService.del(cacheKeys.userUsageForFeature(String(userId), featureSlug));
    await cacheService.del(cacheKeys.userUsage(String(userId)));
    // Also invalidate permission cache since usage affects permissions
    // Note: organizationId is needed for permission cache, but we'll invalidate all orgs
    // This is a limitation - in production you might want to track orgId in usage
  }

  /**
   * Format usage object for API response
   * @private
   * @param {Object} usageRecord - Raw usage record from database
   * @returns {Object} Formatted usage object
   */
  _formatUsage(usageRecord) {
    return {
      id: usageRecord.id,
      userId: usageRecord.userId,
      featureSlug: usageRecord.featureSlug,
      currentUsage: usageRecord.currentUsage,
      createdAt: usageRecord.createdAt,
      updatedAt: usageRecord.updatedAt
    };
  }
}

const usageService = new UsageService();
export default usageService;
