import { eq, and, or, isNull, lt, gte, desc, sql } from 'drizzle-orm';
import db from '../config/db.js';
import { overrides } from '../models/overrides.model.js';
import logger from '../utilities/logger.js';
import { NotFoundError, ValidationError } from '../utilities/errors.js';
import cacheService from './cache.service.js';
import cacheKeys from '../utilities/cache-keys.js';
import { CACHE_TTL } from '../utilities/cache-keys.js';
import usersService from './users.service.js';
import organizationsService from './organizations.service.js';

/**
 * OverridesService - Handles all override-related database operations
 * Overrides have HIGHEST priority in permission resolution
 * User-level > org-level > plan rules
 */
class OverridesService {
  /**
   * Create user-level override
   * @param {number} userId - User ID (database ID)
   * @param {string} featureSlug - Feature slug
   * @param {string} overrideType - 'feature_enable', 'feature_disable', 'limit_increase'
   * @param {number|null} value - Numeric value for limit_increase, null for toggles
   * @param {Date|null} expiresAt - Expiration date, null = permanent
   * @param {string|null} reason - Reason for override
   * @param {number} createdBy - User ID who created the override
   * @returns {Promise<Object>} Override object
   */
  async createUserOverride(userId, featureSlug, overrideType, value = null, expiresAt = null, reason = null, createdBy) {
    if (!userId) {
      throw new ValidationError('User ID is required');
    }

    if (!featureSlug || featureSlug.trim().length === 0) {
      throw new ValidationError('Feature slug is required');
    }

    if (!overrideType) {
      throw new ValidationError('Override type is required');
    }

    if (!createdBy) {
      throw new ValidationError('Created by user ID is required');
    }

    // Validate override type
    const validTypes = ['feature_enable', 'feature_disable', 'limit_increase'];
    if (!validTypes.includes(overrideType)) {
      throw new ValidationError(`Invalid override type. Must be one of: ${validTypes.join(', ')}`);
    }

    // Validate value for limit_increase
    if (overrideType === 'limit_increase' && (value === null || value === undefined || value <= 0)) {
      throw new ValidationError('Value is required and must be positive for limit_increase');
    }

    // Validate value is null for feature toggles
    if ((overrideType === 'feature_enable' || overrideType === 'feature_disable') && value !== null) {
      throw new ValidationError('Value must be null for feature enable/disable overrides');
    }

    // Verify user exists
    const user = await usersService.getUserById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Verify feature exists
    const featuresService = (await import('./features.service.js')).default;
    const feature = await featuresService.getFeatureBySlug(featureSlug);
    if (!feature) {
      throw new NotFoundError(`Feature with slug '${featureSlug}' not found`);
    }

    try {
      const [newOverride] = await db
        .insert(overrides)
        .values({
          userId,
          organizationId: null,
          featureSlug: featureSlug.toLowerCase(),
          overrideType,
          value: value ? BigInt(value) : null,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
          reason: reason ? reason.trim() : null,
          createdBy
        })
        .returning();

      // Invalidate user override cache
      await cacheService.del(cacheKeys.userOverrides(String(userId)));

      logger.info({ overrideId: newOverride.id, userId, featureSlug, overrideType }, 'User override created');

      return this._formatOverride(newOverride);
    } catch (error) {
      logger.error({ error, userId, featureSlug, overrideType }, 'Failed to create user override');
      throw error;
    }
  }

  /**
   * Create organization-level override
   * @param {number} organizationId - Organization ID
   * @param {string} featureSlug - Feature slug
   * @param {string} overrideType - 'feature_enable', 'feature_disable', 'limit_increase'
   * @param {number|null} value - Numeric value for limit_increase, null for toggles
   * @param {Date|null} expiresAt - Expiration date, null = permanent
   * @param {string|null} reason - Reason for override
   * @param {number} createdBy - User ID who created the override
   * @returns {Promise<Object>} Override object
   */
  async createOrganizationOverride(organizationId, featureSlug, overrideType, value = null, expiresAt = null, reason = null, createdBy) {
    if (!organizationId) {
      throw new ValidationError('Organization ID is required');
    }

    if (!featureSlug || featureSlug.trim().length === 0) {
      throw new ValidationError('Feature slug is required');
    }

    if (!overrideType) {
      throw new ValidationError('Override type is required');
    }

    if (!createdBy) {
      throw new ValidationError('Created by user ID is required');
    }

    // Validate override type
    const validTypes = ['feature_enable', 'feature_disable', 'limit_increase'];
    if (!validTypes.includes(overrideType)) {
      throw new ValidationError(`Invalid override type. Must be one of: ${validTypes.join(', ')}`);
    }

    // Validate value for limit_increase
    if (overrideType === 'limit_increase' && (value === null || value === undefined || value <= 0)) {
      throw new ValidationError('Value is required and must be positive for limit_increase');
    }

    // Validate value is null for feature toggles
    if ((overrideType === 'feature_enable' || overrideType === 'feature_disable') && value !== null) {
      throw new ValidationError('Value must be null for feature enable/disable overrides');
    }

    // Verify organization exists
    const org = await organizationsService.getOrganization(organizationId);
    if (!org) {
      throw new NotFoundError('Organization not found');
    }

    // Verify feature exists
    const featuresService = (await import('./features.service.js')).default;
    const feature = await featuresService.getFeatureBySlug(featureSlug);
    if (!feature) {
      throw new NotFoundError(`Feature with slug '${featureSlug}' not found`);
    }

    try {
      const [newOverride] = await db
        .insert(overrides)
        .values({
          userId: null,
          organizationId,
          featureSlug: featureSlug.toLowerCase(),
          overrideType,
          value: value ? BigInt(value) : null,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
          reason: reason ? reason.trim() : null,
          createdBy
        })
        .returning();

      // Invalidate org override cache
      await cacheService.del(cacheKeys.orgOverrides(organizationId));

      logger.info({ overrideId: newOverride.id, organizationId, featureSlug, overrideType }, 'Organization override created');

      return this._formatOverride(newOverride);
    } catch (error) {
      logger.error({ error, organizationId, featureSlug, overrideType }, 'Failed to create organization override');
      throw error;
    }
  }

  /**
   * Get all active (non-expired) overrides for user
   * @param {number} userId - User ID (database ID)
   * @returns {Promise<Array>} Array of override objects
   */
  async getUserActiveOverrides(userId) {
    if (!userId) {
      throw new ValidationError('User ID is required');
    }

    const cacheKey = cacheKeys.userOverrides(String(userId));

    try {
      // Try cache first
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.debug({ userId }, 'User active overrides retrieved from cache');
        return cached;
      }

      const now = new Date();
      const overrideList = await db
        .select()
        .from(overrides)
        .where(
          and(
            eq(overrides.userId, userId),
            or(
              isNull(overrides.expiresAt),
              gte(overrides.expiresAt, now)
            )
          )
        )
        .orderBy(desc(overrides.createdAt));

      const formatted = overrideList.map(override => this._formatOverride(override));

      // Cache for 5 minutes
      await cacheService.set(cacheKey, formatted, CACHE_TTL.PERMISSIONS);

      return formatted;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get user active overrides');
      throw error;
    }
  }

  /**
   * Get all active (non-expired) overrides for organization
   * @param {number} orgId - Organization ID
   * @returns {Promise<Array>} Array of override objects
   */
  async getOrganizationActiveOverrides(orgId) {
    if (!orgId) {
      throw new ValidationError('Organization ID is required');
    }

    const cacheKey = cacheKeys.orgOverrides(orgId);

    try {
      // Try cache first
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.debug({ orgId }, 'Organization active overrides retrieved from cache');
        return cached;
      }

      const now = new Date();
      const overrideList = await db
        .select()
        .from(overrides)
        .where(
          and(
            eq(overrides.organizationId, orgId),
            or(
              isNull(overrides.expiresAt),
              gte(overrides.expiresAt, now)
            )
          )
        )
        .orderBy(desc(overrides.createdAt));

      const formatted = overrideList.map(override => this._formatOverride(override));

      // Cache for 5 minutes
      await cacheService.set(cacheKey, formatted, CACHE_TTL.PERMISSIONS);

      return formatted;
    } catch (error) {
      logger.error({ error, orgId }, 'Failed to get organization active overrides');
      throw error;
    }
  }

  /**
   * Get active override for specific feature for user
   * @param {number} userId - User ID (database ID)
   * @param {string} featureSlug - Feature slug
   * @returns {Promise<Object|null>} Override object or null
   */
  async getUserOverrideForFeature(userId, featureSlug) {
    if (!userId || !featureSlug) {
      return null;
    }

    const cacheKey = `${cacheKeys.userOverrides(String(userId))}:feature:${featureSlug}`;

    try {
      // Try cache first
      const cached = await cacheService.get(cacheKey);
      if (cached !== null) {
        return cached;
      }

      const now = new Date();
      const [override] = await db
        .select()
        .from(overrides)
        .where(
          and(
            eq(overrides.userId, userId),
            eq(overrides.featureSlug, featureSlug.toLowerCase()),
            or(
              isNull(overrides.expiresAt),
              gte(overrides.expiresAt, now)
            )
          )
        )
        .limit(1);

      const result = override ? this._formatOverride(override) : null;

      // Cache for 5 minutes
      await cacheService.set(cacheKey, result, CACHE_TTL.PERMISSIONS);

      return result;
    } catch (error) {
      logger.error({ error, userId, featureSlug }, 'Failed to get user override for feature');
      return null;
    }
  }

  /**
   * Get active override for feature in organization
   * @param {number} orgId - Organization ID
   * @param {string} featureSlug - Feature slug
   * @returns {Promise<Object|null>} Override object or null
   */
  async getOrganizationOverrideForFeature(orgId, featureSlug) {
    if (!orgId || !featureSlug) {
      return null;
    }

    const cacheKey = `${cacheKeys.orgOverrides(orgId)}:feature:${featureSlug}`;

    try {
      // Try cache first
      const cached = await cacheService.get(cacheKey);
      if (cached !== null) {
        return cached;
      }

      const now = new Date();
      const [override] = await db
        .select()
        .from(overrides)
        .where(
          and(
            eq(overrides.organizationId, orgId),
            eq(overrides.featureSlug, featureSlug.toLowerCase()),
            or(
              isNull(overrides.expiresAt),
              gte(overrides.expiresAt, now)
            )
          )
        )
        .limit(1);

      const result = override ? this._formatOverride(override) : null;

      // Cache for 5 minutes
      await cacheService.set(cacheKey, result, CACHE_TTL.PERMISSIONS);

      return result;
    } catch (error) {
      logger.error({ error, orgId, featureSlug }, 'Failed to get organization override for feature');
      return null;
    }
  }

  /**
   * Update override
   * @param {number} overrideId - Override ID
   * @param {Object} updates - Updates object { value?, expiresAt?, reason? }
   * @returns {Promise<Object>} Updated override object
   */
  async updateOverride(overrideId, updates) {
    if (!overrideId) {
      throw new ValidationError('Override ID is required');
    }

    // Check if override exists
    const existing = await this.getOverrideById(overrideId);
    if (!existing) {
      throw new NotFoundError('Override not found');
    }

    const updateData = {
      updatedAt: new Date()
    };

    if (updates.value !== undefined) {
      if (existing.overrideType === 'limit_increase' && (updates.value === null || updates.value <= 0)) {
        throw new ValidationError('Value is required and must be positive for limit_increase');
      }
      if ((existing.overrideType === 'feature_enable' || existing.overrideType === 'feature_disable') && updates.value !== null) {
        throw new ValidationError('Value must be null for feature enable/disable overrides');
      }
      updateData.value = updates.value ? BigInt(updates.value) : null;
    }

    if (updates.expiresAt !== undefined) {
      updateData.expiresAt = updates.expiresAt ? new Date(updates.expiresAt) : null;
    }

    if (updates.reason !== undefined) {
      updateData.reason = updates.reason ? updates.reason.trim() : null;
    }

    try {
      const [updated] = await db
        .update(overrides)
        .set(updateData)
        .where(eq(overrides.id, overrideId))
        .returning();

      // Invalidate caches
      await this._invalidateOverrideCaches(updated);

      logger.info({ overrideId }, 'Override updated');

      return this._formatOverride(updated);
    } catch (error) {
      logger.error({ error, overrideId }, 'Failed to update override');
      throw error;
    }
  }

  /**
   * Delete override
   * @param {number} overrideId - Override ID
   * @returns {Promise<void>}
   */
  async deleteOverride(overrideId) {
    if (!overrideId) {
      throw new ValidationError('Override ID is required');
    }

    // Get override before deletion for cache invalidation
    const override = await this.getOverrideById(overrideId);
    if (!override) {
      throw new NotFoundError('Override not found');
    }

    try {
      await db
        .delete(overrides)
        .where(eq(overrides.id, overrideId));

      // Invalidate caches
      await this._invalidateOverrideCaches(override);

      logger.info({ overrideId }, 'Override deleted');
    } catch (error) {
      logger.error({ error, overrideId }, 'Failed to delete override');
      throw error;
    }
  }

  /**
   * Expire override (set expiresAt to now)
   * @param {number} overrideId - Override ID
   * @returns {Promise<Object>} Updated override object
   */
  async expireOverride(overrideId) {
    if (!overrideId) {
      throw new ValidationError('Override ID is required');
    }

    const override = await this.getOverrideById(overrideId);
    if (!override) {
      throw new NotFoundError('Override not found');
    }

    try {
      const [updated] = await db
        .update(overrides)
        .set({
          expiresAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(overrides.id, overrideId))
        .returning();

      // Invalidate caches
      await this._invalidateOverrideCaches(updated);

      logger.info({ overrideId }, 'Override expired');

      return this._formatOverride(updated);
    } catch (error) {
      logger.error({ error, overrideId }, 'Failed to expire override');
      throw error;
    }
  }

  /**
   * Get all overrides for a feature (for auditing)
   * @param {string} featureSlug - Feature slug
   * @param {number} limit - Page size (default: 50)
   * @param {number} offset - Offset for pagination (default: 0)
   * @returns {Promise<Object>} { overrides: [], total: number }
   */
  async getOverridesForFeature(featureSlug, limit = 50, offset = 0) {
    if (!featureSlug) {
      throw new ValidationError('Feature slug is required');
    }

    try {
      // Get total count
      const totalResult = await db
        .select({ count: sql`count(*)` })
        .from(overrides)
        .where(eq(overrides.featureSlug, featureSlug.toLowerCase()));

      const total = parseInt(totalResult[0]?.count || 0, 10);

      // Get paginated overrides
      const overrideList = await db
        .select()
        .from(overrides)
        .where(eq(overrides.featureSlug, featureSlug.toLowerCase()))
        .orderBy(desc(overrides.createdAt))
        .limit(limit)
        .offset(offset);

      return {
        overrides: overrideList.map(override => this._formatOverride(override)),
        total,
        limit,
        offset,
        hasMore: offset + limit < total
      };
    } catch (error) {
      logger.error({ error, featureSlug }, 'Failed to get overrides for feature');
      throw error;
    }
  }

  /**
   * Get all expired overrides
   * @returns {Promise<Array>} Array of expired override objects
   */
  async getExpiredOverrides() {
    try {
      const now = new Date();
      const expiredList = await db
        .select()
        .from(overrides)
        .where(
          and(
            isNull(overrides.userId), // Only get org-level expired overrides for cleanup
            lt(overrides.expiresAt, now)
          )
        )
        .orderBy(desc(overrides.expiresAt));

      return expiredList.map(override => this._formatOverride(override));
    } catch (error) {
      logger.error({ error }, 'Failed to get expired overrides');
      throw error;
    }
  }

  /**
   * Delete all expired overrides
   * @returns {Promise<number>} Count of deleted overrides
   */
  async deleteExpiredOverrides() {
    try {
      const now = new Date();
      const expiredList = await db
        .select()
        .from(overrides)
        .where(lt(overrides.expiresAt, now));

      if (expiredList.length === 0) {
        return 0;
      }

      // Delete expired overrides
      await db
        .delete(overrides)
        .where(lt(overrides.expiresAt, now));

      // Invalidate all caches (batch operation)
      for (const override of expiredList) {
        await this._invalidateOverrideCaches(override);
      }

      logger.info({ count: expiredList.length }, 'Expired overrides deleted');

      return expiredList.length;
    } catch (error) {
      logger.error({ error }, 'Failed to delete expired overrides');
      throw error;
    }
  }

  /**
   * Get all overrides for user in specific organization
   * Includes both user-level and org-level overrides
   * @param {number} userId - User ID (database ID)
   * @param {number} organizationId - Organization ID
   * @returns {Promise<Array>} Array of override objects
   */
  async getUserOrganizationOverrides(userId, organizationId) {
    if (!userId) {
      throw new ValidationError('User ID is required');
    }

    if (!organizationId) {
      throw new ValidationError('Organization ID is required');
    }

    try {
      const now = new Date();

      // Get user-level overrides
      const userOverrides = await db
        .select()
        .from(overrides)
        .where(
          and(
            eq(overrides.userId, userId),
            or(
              isNull(overrides.expiresAt),
              gte(overrides.expiresAt, now)
            )
          )
        );

      // Get org-level overrides
      const orgOverrides = await db
        .select()
        .from(overrides)
        .where(
          and(
            eq(overrides.organizationId, organizationId),
            or(
              isNull(overrides.expiresAt),
              gte(overrides.expiresAt, now)
            )
          )
        );

      // Combine and format
      const allOverrides = [...userOverrides, ...orgOverrides].map(override => this._formatOverride(override));

      return allOverrides;
    } catch (error) {
      logger.error({ error, userId, organizationId }, 'Failed to get user organization overrides');
      throw error;
    }
  }

  /**
   * Get override by ID
   * @param {number} overrideId - Override ID
   * @returns {Promise<Object|null>} Override object or null
   */
  async getOverrideById(overrideId) {
    if (!overrideId) {
      return null;
    }

    try {
      const [override] = await db
        .select()
        .from(overrides)
        .where(eq(overrides.id, overrideId))
        .limit(1);

      return override ? this._formatOverride(override) : null;
    } catch (error) {
      logger.error({ error, overrideId }, 'Failed to get override by ID');
      return null;
    }
  }

  /**
   * Get all overrides with filtering
   * @param {Object} filters - { featureSlug?, status?, organizationId?, limit?, offset? }
   * @returns {Promise<Object>} { overrides: [], total: number }
   */
  async getAllOverrides(filters = {}) {
    const {
      featureSlug,
      status = 'active', // 'active', 'expired', 'all'
      organizationId,
      limit = 50,
      offset = 0
    } = filters;

    try {
      let conditions = [];

      if (featureSlug) {
        conditions.push(eq(overrides.featureSlug, featureSlug.toLowerCase()));
      }

      if (organizationId) {
        conditions.push(eq(overrides.organizationId, organizationId));
      }

      if (status === 'active') {
        const now = new Date();
        conditions.push(
          or(
            isNull(overrides.expiresAt),
            gte(overrides.expiresAt, now)
          )
        );
      } else if (status === 'expired') {
        const now = new Date();
        conditions.push(lt(overrides.expiresAt, now));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      // Get total count
      const totalResult = await db
        .select({ count: sql`count(*)` })
        .from(overrides)
        .where(whereClause);

      const total = parseInt(totalResult[0]?.count || 0, 10);

      // Get paginated overrides
      const overrideList = await db
        .select()
        .from(overrides)
        .where(whereClause)
        .orderBy(desc(overrides.createdAt))
        .limit(limit)
        .offset(offset);

      return {
        overrides: overrideList.map(override => this._formatOverride(override)),
        total,
        limit,
        offset,
        hasMore: offset + limit < total
      };
    } catch (error) {
      logger.error({ error, filters }, 'Failed to get all overrides');
      throw error;
    }
  }

  /**
   * Invalidate override-related caches
   * @private
   * @param {Object} override - Override object
   */
  async _invalidateOverrideCaches(override) {
    if (override.userId) {
      await cacheService.del(cacheKeys.userOverrides(String(override.userId)));
      await cacheService.del(`${cacheKeys.userOverrides(String(override.userId))}:feature:${override.featureSlug}`);
    }

    if (override.organizationId) {
      await cacheService.del(cacheKeys.orgOverrides(override.organizationId));
      await cacheService.del(`${cacheKeys.orgOverrides(override.organizationId)}:feature:${override.featureSlug}`);
    }
  }

  /**
   * Format override object for API response
   * @private
   * @param {Object} override - Raw override from database
   * @returns {Object} Formatted override object
   */
  _formatOverride(override) {
    return {
      id: override.id,
      userId: override.userId,
      organizationId: override.organizationId,
      featureSlug: override.featureSlug,
      overrideType: override.overrideType,
      value: override.value ? Number(override.value) : null,
      expiresAt: override.expiresAt,
      reason: override.reason,
      createdBy: override.createdBy,
      createdAt: override.createdAt,
      updatedAt: override.updatedAt,
      isExpired: override.expiresAt ? new Date(override.expiresAt) < new Date() : false,
      isPermanent: override.expiresAt === null
    };
  }
}

const overridesService = new OverridesService();
export default overridesService;
