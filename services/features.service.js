import { eq, and, ilike, or, desc, sql } from "drizzle-orm";
import db from "../config/db.js";
import { features } from "../models/features.model.js";
import { planFeatures } from "../models/plan-features.model.js";
import { rolePermissions } from "../models/role-permissions.model.js";
import logger from "../utilities/logger.js";
import {
  NotFoundError,
  ValidationError,
  ConflictError,
} from "../utilities/errors.js";
import cacheService from "./cache.service.js";
import cacheKeys from "../utilities/cache-keys.js";
import { CACHE_TTL } from "../utilities/cache-keys.js";

/**
 * FeaturesService - Handles all feature-related database operations
 * Features are organization-scoped - each organization has its own features
 */
class FeaturesService {
  /**
   * Create new feature for an organization
   * @param {number} organizationId - Organization ID
   * @param {string} name - Feature name
   * @param {string} slug - Feature slug (lowercase, alphanumeric, hyphens)
   * @param {string|null} description - Feature description (optional)
   * @returns {Promise<Object>} Feature object
   */
  async createFeature(organizationId, name, slug, description = null) {
    if (!organizationId) {
      throw new ValidationError("Organization ID is required");
    }

    if (!name || name.trim().length === 0) {
      throw new ValidationError("Feature name is required");
    }

    if (!slug || slug.trim().length === 0) {
      throw new ValidationError("Feature slug is required");
    }

    // Validate slug format: lowercase, alphanumeric, hyphens
    const slugRegex = /^[a-z0-9-]+$/;
    if (!slugRegex.test(slug)) {
      throw new ValidationError(
        "Slug must be lowercase, alphanumeric, and can contain hyphens"
      );
    }

    // Check if slug already exists in this organization
    const existing = await this.featureExistsInOrg(organizationId, slug);
    if (existing) {
      throw new ConflictError(
        `Feature with slug '${slug}' already exists in this organization`
      );
    }

    try {
      const [newFeature] = await db
        .insert(features)
        .values({
          organizationId,
          name: name.trim(),
          slug: slug.trim().toLowerCase(),
          description: description?.trim() || null,
        })
        .returning();

      logger.info(
        { featureId: newFeature.id, organizationId, name, slug },
        "Feature created"
      );

      // Invalidate org features cache
      await cacheService.del(`features:org:${organizationId}`);

      return this._formatFeature(newFeature);
    } catch (error) {
      logger.error(
        { error, organizationId, name, slug },
        "Failed to create feature"
      );

      // Handle unique constraint violation
      if (error.code === "23505" || error.message?.includes("unique")) {
        throw new ConflictError(
          `Feature with slug '${slug}' already exists in this organization`
        );
      }

      throw error;
    }
  }

  /**
   * Get feature by ID
   * @param {number} featureId - Feature ID
   * @returns {Promise<Object|null>} Feature object or null
   */
  async getFeature(featureId) {
    if (!featureId) {
      throw new ValidationError("Feature ID is required");
    }

    const cacheKey = cacheKeys.feature(featureId);
    const cached = await cacheService.get(cacheKey);

    if (cached) {
      logger.debug({ featureId }, "Feature retrieved from cache");
      return cached;
    }

    try {
      const [feature] = await db
        .select()
        .from(features)
        .where(eq(features.id, featureId))
        .limit(1);

      if (!feature) {
        return null;
      }

      const formatted = this._formatFeature(feature);
      await cacheService.set(cacheKey, formatted, CACHE_TTL.FEATURES);

      return formatted;
    } catch (error) {
      logger.error({ error, featureId }, "Failed to get feature");
      throw error;
    }
  }

  /**
   * Get feature by slug within an organization
   * @param {number} organizationId - Organization ID
   * @param {string} slug - Feature slug
   * @returns {Promise<Object|null>} Feature object or null
   */
  async getFeatureBySlug(organizationId, slug) {
    if (!organizationId || !slug) {
      return null;
    }

    try {
      const [feature] = await db
        .select()
        .from(features)
        .where(
          and(
            eq(features.organizationId, organizationId),
            eq(features.slug, slug.toLowerCase())
          )
        )
        .limit(1);

      return feature ? this._formatFeature(feature) : null;
    } catch (error) {
      logger.error(
        { error, organizationId, slug },
        "Failed to get feature by slug"
      );
      return null;
    }
  }

  /**
   * Get all features for an organization with pagination
   * @param {number} organizationId - Organization ID
   * @param {number} limit - Page size (default: 100)
   * @param {number} offset - Offset for pagination (default: 0)
   * @returns {Promise<Object>} { features: [], total: number, hasMore: boolean }
   */
  async getAllFeatures(organizationId, limit = 100, offset = 0) {
    if (!organizationId) {
      throw new ValidationError("Organization ID is required");
    }

    // Check cache for all features (only if no pagination)
    const cacheKey = `features:org:${organizationId}`;
    if (offset === 0 && limit >= 100) {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.debug({ organizationId }, "Org features retrieved from cache");
        return cached;
      }
    }

    try {
      // Get total count for this organization
      const totalResult = await db
        .select({ count: sql`count(*)` })
        .from(features)
        .where(eq(features.organizationId, organizationId));

      const total = Number(totalResult[0]?.count || 0);

      // Get paginated features for this organization
      const featureList = await db
        .select()
        .from(features)
        .where(eq(features.organizationId, organizationId))
        .orderBy(desc(features.createdAt))
        .limit(limit)
        .offset(offset);

      const result = {
        features: featureList.map((f) => this._formatFeature(f)),
        total,
        hasMore: offset + limit < total,
      };

      // Cache if no pagination
      if (offset === 0 && limit >= 100) {
        await cacheService.set(cacheKey, result, CACHE_TTL.FEATURES);
      }

      return result;
    } catch (error) {
      logger.error(
        { error, organizationId },
        "Failed to get organization features"
      );
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
      throw new ValidationError("Feature ID is required");
    }

    // Get existing feature
    const existing = await this.getFeature(featureId);
    if (!existing) {
      throw new NotFoundError("Feature not found");
    }

    // Slug is immutable
    if (updates.slug !== undefined && updates.slug !== existing.slug) {
      throw new ValidationError("Feature slug cannot be modified");
    }

    // Build update data
    const updateData = {
      updatedAt: new Date(),
    };

    if (updates.name !== undefined) {
      if (!updates.name || updates.name.trim().length === 0) {
        throw new ValidationError("Feature name cannot be empty");
      }
      updateData.name = updates.name.trim();
    }

    if (updates.description !== undefined) {
      updateData.description = updates.description?.trim() || null;
    }

    try {
      const [updated] = await db
        .update(features)
        .set(updateData)
        .where(eq(features.id, featureId))
        .returning();

      // Invalidate caches
      await cacheService.del(cacheKeys.feature(featureId));
      await cacheService.del(`features:org:${existing.organizationId}`);

      logger.info({ featureId }, "Feature updated");

      return this._formatFeature(updated);
    } catch (error) {
      logger.error({ error, featureId }, "Failed to update feature");
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
      throw new ValidationError("Feature ID is required");
    }

    // Get existing feature
    const existing = await this.getFeature(featureId);
    if (!existing) {
      throw new NotFoundError("Feature not found");
    }

    // Check if used in plans
    const planUsage = await db
      .select()
      .from(planFeatures)
      .where(eq(planFeatures.featureId, featureId))
      .limit(1);

    if (planUsage.length > 0) {
      throw new ConflictError(
        "Cannot delete feature that is used in plans. Remove from plans first."
      );
    }

    // Check if used in role permissions
    const roleUsage = await db
      .select()
      .from(rolePermissions)
      .where(eq(rolePermissions.featureSlug, existing.slug))
      .limit(1);

    if (roleUsage.length > 0) {
      throw new ConflictError(
        "Cannot delete feature that is used in role permissions. Remove from roles first."
      );
    }

    try {
      await db.delete(features).where(eq(features.id, featureId));

      // Invalidate caches
      await cacheService.del(cacheKeys.feature(featureId));
      await cacheService.del(`features:org:${existing.organizationId}`);

      logger.info(
        { featureId, organizationId: existing.organizationId },
        "Feature deleted"
      );
    } catch (error) {
      logger.error({ error, featureId }, "Failed to delete feature");
      throw error;
    }
  }

  /**
   * Search features within an organization
   * @param {number} organizationId - Organization ID
   * @param {string} query - Search query
   * @returns {Promise<Array>} Array of matching features
   */
  async searchFeatures(organizationId, query) {
    if (!organizationId) {
      throw new ValidationError("Organization ID is required");
    }

    if (!query || query.trim().length === 0) {
      return [];
    }

    const searchTerm = `%${query.trim()}%`;

    try {
      const results = await db
        .select()
        .from(features)
        .where(
          and(
            eq(features.organizationId, organizationId),
            or(
              ilike(features.name, searchTerm),
              ilike(features.slug, searchTerm),
              ilike(features.description, searchTerm)
            )
          )
        )
        .orderBy(desc(features.createdAt))
        .limit(50);

      return results.map((f) => this._formatFeature(f));
    } catch (error) {
      logger.error(
        { error, organizationId, query },
        "Failed to search features"
      );
      return [];
    }
  }

  /**
   * Check if feature exists by slug in an organization
   * @param {number} organizationId - Organization ID
   * @param {string} slug - Feature slug
   * @returns {Promise<boolean>}
   */
  async featureExistsInOrg(organizationId, slug) {
    if (!organizationId || !slug) {
      return false;
    }

    try {
      const [existing] = await db
        .select({ id: features.id })
        .from(features)
        .where(
          and(
            eq(features.organizationId, organizationId),
            eq(features.slug, slug.toLowerCase())
          )
        )
        .limit(1);

      return !!existing;
    } catch (error) {
      logger.error(
        { error, organizationId, slug },
        "Failed to check feature existence"
      );
      return false;
    }
  }

  /**
   * Get total count of features for an organization
   * @param {number} organizationId - Organization ID
   * @returns {Promise<number>}
   */
  async getTotalFeaturesCount(organizationId) {
    if (!organizationId) {
      return 0;
    }

    try {
      const result = await db
        .select({ count: sql`count(*)` })
        .from(features)
        .where(eq(features.organizationId, organizationId));

      return Number(result[0]?.count || 0);
    } catch (error) {
      logger.error({ error, organizationId }, "Failed to get features count");
      return 0;
    }
  }

  /**
   * Legacy method - Check if feature exists by slug (global check for backward compatibility)
   * @deprecated Use featureExistsInOrg instead
   * @param {string} slug - Feature slug
   * @returns {Promise<boolean>}
   */
  async featureExists(slug) {
    if (!slug) {
      return false;
    }

    try {
      const [existing] = await db
        .select({ id: features.id })
        .from(features)
        .where(eq(features.slug, slug.toLowerCase()))
        .limit(1);

      return !!existing;
    } catch (error) {
      logger.error({ error, slug }, "Failed to check feature existence");
      return false;
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
      organizationId: feature.organizationId,
      name: feature.name,
      slug: feature.slug,
      description: feature.description,
      createdAt: feature.createdAt,
      updatedAt: feature.updatedAt,
    };
  }
}

// Create singleton instance
const featuresService = new FeaturesService();

export default featuresService;
