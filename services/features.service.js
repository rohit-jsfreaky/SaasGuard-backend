import { eq, ilike, or, desc, sql } from 'drizzle-orm';
import db from '../config/db.js';
import { features } from '../models/features.model.js';
import { planFeatures } from '../models/plan-features.model.js';
import { rolePermissions } from '../models/role-permissions.model.js';
import logger from '../utilities/logger.js';
import { NotFoundError, ValidationError, ConflictError } from '../utilities/errors.js';
import cacheService from './cache.service.js';
import cacheKeys from '../utilities/cache-keys.js';
import { CACHE_TTL } from '../utilities/cache-keys.js';

/**
 * FeaturesService - Handles all feature-related database operations
 * Features are globally unique and application-wide (not org-scoped)
 */
class FeaturesService {
  /**
   * Create new feature
   * @param {string} name - Feature name
   * @param {string} slug - Feature slug (lowercase, alphanumeric, hyphens)
   * @param {string|null} description - Feature description (optional)
   * @returns {Promise<Object>} Feature object
   */
  async createFeature(name, slug, description = null) {
    if (!name || name.trim().length === 0) {
      throw new ValidationError('Feature name is required');
    }

    if (!slug || slug.trim().length === 0) {
      throw new ValidationError('Feature slug is required');
    }

    // Validate slug format: lowercase, alphanumeric, hyphens
    const slugRegex = /^[a-z0-9-]+$/;
    if (!slugRegex.test(slug)) {
      throw new ValidationError('Slug must be lowercase, alphanumeric, and can contain hyphens');
    }

    // Check if slug already exists
    const existing = await this.featureExists(slug);
    if (existing) {
      throw new ConflictError(`Feature with slug '${slug}' already exists`);
    }

    try {
      const [newFeature] = await db
        .insert(features)
        .values({
          name: name.trim(),
          slug: slug.trim().toLowerCase(),
          description: description?.trim() || null
        })
        .returning();

      logger.info({ featureId: newFeature.id, name, slug }, 'Feature created');

      // Invalidate all features cache
      await cacheService.del('features:all');

      return this._formatFeature(newFeature);
    } catch (error) {
      logger.error({ error, name, slug }, 'Failed to create feature');
      
      // Handle unique constraint violation
      if (error.code === '23505' || error.message?.includes('unique')) {
        throw new ConflictError(`Feature with slug '${slug}' already exists`);
      }
      
      throw error;
    }
  }

  /**
   * Get feature by ID or slug
   * Cached for 24 hours
   * @param {string|number} identifier - Feature ID or slug
   * @returns {Promise<Object|null>} Feature object or null
   */
  async getFeature(identifier) {
    if (!identifier) {
      throw new ValidationError('Feature identifier is required');
    }

    // Check cache first
    const cacheKey = cacheKeys.feature(identifier);
    const cached = await cacheService.get(cacheKey);

    if (cached) {
      logger.debug({ identifier }, 'Feature retrieved from cache');
      return cached;
    }

    try {
      // Try as ID first (if numeric), then as slug
      const isNumeric = !isNaN(identifier) && !isNaN(parseInt(identifier, 10));
      
      let feature;
      if (isNumeric) {
        [feature] = await db
          .select()
          .from(features)
          .where(eq(features.id, parseInt(identifier, 10)))
          .limit(1);
      }

      // If not found by ID or not numeric, try slug
      if (!feature) {
        [feature] = await db
          .select()
          .from(features)
          .where(eq(features.slug, String(identifier).toLowerCase()))
          .limit(1);
      }

      if (!feature) {
        return null;
      }

      const formatted = this._formatFeature(feature);

      // Cache for 24 hours (features are static)
      await cacheService.set(cacheKey, formatted, CACHE_TTL.FEATURES);
      
      // Also cache by slug if looked up by ID
      if (isNumeric && feature.slug) {
        await cacheService.set(cacheKeys.feature(feature.slug), formatted, CACHE_TTL.FEATURES);
      }

      return formatted;
    } catch (error) {
      logger.error({ error, identifier }, 'Failed to get feature');
      throw error;
    }
  }

  /**
   * Get feature by slug
   * Cached for 24 hours
   * @param {string} slug - Feature slug
   * @returns {Promise<Object|null>} Feature object or null
   */
  async getFeatureBySlug(slug) {
    return this.getFeature(slug);
  }

  /**
   * Get all features with pagination
   * Cached for 24 hours
   * @param {number} limit - Page size (default: 100)
   * @param {number} offset - Offset for pagination (default: 0)
   * @returns {Promise<Object>} { features: [], total: number, hasMore: boolean }
   */
  async getAllFeatures(limit = 100, offset = 0) {
    // Check cache for all features (only if no pagination)
    if (offset === 0 && limit >= 100) {
      const cached = await cacheService.get('features:all');
      if (cached) {
        logger.debug('All features retrieved from cache');
        return cached;
      }
    }

    try {
      // Get total count using SQL
      const totalResult = await db
        .select({ count: sql`count(*)` })
        .from(features);

      const total = Number(totalResult[0]?.count || 0);

      // Get paginated features
      const featureList = await db
        .select()
        .from(features)
        .orderBy(desc(features.createdAt))
        .limit(limit)
        .offset(offset);

      const result = {
        features: featureList.map(f => this._formatFeature(f)),
        total,
        hasMore: offset + limit < total
      };

      // Cache all features if no pagination
      if (offset === 0 && limit >= 100) {
        await cacheService.set('features:all', result, CACHE_TTL.FEATURES);
      }

      return result;
    } catch (error) {
      logger.error({ error }, 'Failed to get all features');
      throw error;
    }
  }

  /**
   * Update feature
   * Slug cannot be updated (immutable)
   * @param {number} featureId - Feature ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated feature object
   */
  async updateFeature(featureId, updates) {
    if (!featureId) {
      throw new ValidationError('Feature ID is required');
    }

    // Only allow updating name and description
    const allowedFields = ['name', 'description'];
    const filteredUpdates = {};

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        if (field === 'name' && (!updates[field] || updates[field].trim().length === 0)) {
          throw new ValidationError('Feature name cannot be empty');
        }
        filteredUpdates[field] = updates[field]?.trim() || null;
      }
    }

    if (Object.keys(filteredUpdates).length === 0) {
      throw new ValidationError('No valid fields to update');
    }

    // Add updated timestamp
    filteredUpdates.updatedAt = new Date();

    try {
      // Get feature first
      const [existingFeature] = await db
        .select()
        .from(features)
        .where(eq(features.id, featureId))
        .limit(1);

      if (!existingFeature) {
        throw new NotFoundError('Feature not found');
      }

      // Update feature
      const [updated] = await db
        .update(features)
        .set(filteredUpdates)
        .where(eq(features.id, featureId))
        .returning();

      // Invalidate caches
      await cacheService.del(cacheKeys.feature(featureId));
      await cacheService.del(cacheKeys.feature(existingFeature.slug));
      await cacheService.del('features:all');

      logger.info({ featureId, updates: filteredUpdates }, 'Feature updated');

      return this._formatFeature(updated);
    } catch (error) {
      logger.error({ error, featureId }, 'Failed to update feature');
      throw error;
    }
  }

  /**
   * Delete feature
   * Checks if feature is used in plans or roles before deletion
   * @param {number} featureId - Feature ID
   * @returns {Promise<void>}
   */
  async deleteFeature(featureId) {
    if (!featureId) {
      throw new ValidationError('Feature ID is required');
    }

    try {
      // Get feature first
      const feature = await this.getFeature(featureId);
      if (!feature) {
        throw new NotFoundError('Feature not found');
      }

      // Check if used in plans
      const planUsageResult = await db
        .select({ count: sql`count(*)` })
        .from(planFeatures)
        .where(eq(planFeatures.featureId, featureId));

      const planCount = Number(planUsageResult[0]?.count || 0);

      // Check if used in roles (by slug)
      const roleUsageResult = await db
        .select({ count: sql`count(*)` })
        .from(rolePermissions)
        .where(eq(rolePermissions.featureSlug, feature.slug));

      const roleCount = Number(roleUsageResult[0]?.count || 0);

      if (planCount > 0 || roleCount > 0) {
        const reasons = [];
        if (planCount > 0) reasons.push(`used in ${planCount} plan(s)`);
        if (roleCount > 0) reasons.push(`used in ${roleCount} role(s)`);
        throw new ConflictError(`Cannot delete feature: ${reasons.join(', ')}`);
      }

      // Delete feature
      await db
        .delete(features)
        .where(eq(features.id, featureId));

      // Invalidate caches
      await cacheService.del(cacheKeys.feature(featureId));
      await cacheService.del(cacheKeys.feature(feature.slug));
      await cacheService.del('features:all');

      logger.info({ featureId, slug: feature.slug }, 'Feature deleted');
    } catch (error) {
      logger.error({ error, featureId }, 'Failed to delete feature');
      throw error;
    }
  }

  /**
   * Search features by name or description
   * @param {string} query - Search query
   * @returns {Promise<Array>} Array of matching features
   */
  async searchFeatures(query) {
    if (!query || query.trim().length === 0) {
      throw new ValidationError('Search query is required');
    }

    try {
      const searchTerm = `%${query.trim()}%`;

      const results = await db
        .select()
        .from(features)
        .where(
          or(
            ilike(features.name, searchTerm),
            ilike(features.description, searchTerm)
          )
        )
        .orderBy(desc(features.createdAt))
        .limit(50);

      return results.map(f => this._formatFeature(f));
    } catch (error) {
      logger.error({ error, query }, 'Failed to search features');
      throw error;
    }
  }

  /**
   * Check if feature exists by slug
   * Cached for 24 hours
   * @param {string} slug - Feature slug
   * @returns {Promise<boolean>}
   */
  async featureExists(slug) {
    if (!slug) {
      return false;
    }

    try {
      const feature = await this.getFeatureBySlug(slug);
      return feature !== null;
    } catch (error) {
      logger.error({ error, slug }, 'Failed to check if feature exists');
      return false;
    }
  }

  /**
   * Get total count of features
   * @returns {Promise<number>}
   */
  async getTotalFeaturesCount() {
    try {
      const result = await this.getAllFeatures(1, 0);
      return result.total;
    } catch (error) {
      logger.error({ error }, 'Failed to get total features count');
      throw error;
    }
  }

  /**
   * Format feature object for API response
   * @private
   * @param {Object} feature - Raw feature from database
   * @returns {Object} Formatted feature object
   */
  _formatFeature(feature) {
    return {
      id: feature.id,
      name: feature.name,
      slug: feature.slug,
      description: feature.description,
      createdAt: feature.createdAt,
      updatedAt: feature.updatedAt
    };
  }
}

// Create singleton instance
const featuresService = new FeaturesService();

export default featuresService;
