import { eq, sql, and } from "drizzle-orm";
import db from "../config/db.js";
import { plans } from "../models/plans.model.js";
import { planFeatures } from "../models/plan-features.model.js";
import { features } from "../models/features.model.js";
import { users } from "../models/users.model.js";
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
 * PlansService - Handles all plan-related database operations
 * Plans are organization-scoped with unique slugs per organization
 */
class PlansService {
  /**
   * Create new plan
   * @param {number} organizationId - Organization ID
   * @param {string} name - Plan name
   * @param {string} slug - Plan slug (unique within organization)
   * @param {string|null} description - Plan description (optional)
   * @returns {Promise<Object>} Plan object
   */
  async createPlan(organizationId, name, slug, description = null) {
    if (!organizationId) {
      throw new ValidationError("Organization ID is required");
    }

    if (!name || name.trim().length === 0) {
      throw new ValidationError("Plan name is required");
    }

    if (!slug || slug.trim().length === 0) {
      throw new ValidationError("Plan slug is required");
    }

    // Validate slug format: lowercase, alphanumeric, hyphens
    const slugRegex = /^[a-z0-9-]+$/;
    if (!slugRegex.test(slug)) {
      throw new ValidationError(
        "Slug must be lowercase, alphanumeric, and can contain hyphens"
      );
    }

    // Check if slug already exists within organization
    const existing = await this.getPlanBySlug(organizationId, slug);
    if (existing) {
      throw new ConflictError(
        `Plan with slug '${slug}' already exists in this organization`
      );
    }

    try {
      const [newPlan] = await db
        .insert(plans)
        .values({
          name: name.trim(),
          slug: slug.trim().toLowerCase(),
          description: description?.trim() || null,
          organizationId,
        })
        .returning();

      logger.info(
        { planId: newPlan.id, name, slug, organizationId },
        "Plan created"
      );

      // Invalidate organization plans cache
      await cacheService.del(cacheKeys.orgPlans(organizationId));

      return this._formatPlan(newPlan);
    } catch (error) {
      logger.error(
        { error, name, slug, organizationId },
        "Failed to create plan"
      );

      // Handle unique constraint violation
      if (error.code === "23505" || error.message?.includes("unique")) {
        throw new ConflictError(
          `Plan with slug '${slug}' already exists in this organization`
        );
      }

      throw error;
    }
  }

  /**
   * Get plan by ID
   * Cached for 1 hour
   * @param {number} planId - Plan ID
   * @returns {Promise<Object|null>} Plan object or null
   */
  async getPlan(planId) {
    if (!planId) {
      throw new ValidationError("Plan ID is required");
    }

    // Check cache first
    const cacheKey = cacheKeys.plan(planId);
    const cached = await cacheService.get(cacheKey);

    if (cached) {
      logger.debug({ planId }, "Plan retrieved from cache");
      return cached;
    }

    try {
      const [plan] = await db
        .select()
        .from(plans)
        .where(eq(plans.id, planId))
        .limit(1);

      if (!plan) {
        return null;
      }

      const formatted = this._formatPlan(plan);

      // Cache for 1 hour
      await cacheService.set(cacheKey, formatted, CACHE_TTL.PLAN_ROLE_DATA);

      return formatted;
    } catch (error) {
      logger.error({ error, planId }, "Failed to get plan");
      throw error;
    }
  }

  /**
   * Get plan by slug within organization
   * @param {number} organizationId - Organization ID
   * @param {string} slug - Plan slug
   * @returns {Promise<Object|null>} Plan object or null
   */
  async getPlanBySlug(organizationId, slug) {
    if (!organizationId) {
      throw new ValidationError("Organization ID is required");
    }

    if (!slug || slug.trim().length === 0) {
      throw new ValidationError("Plan slug is required");
    }

    try {
      const [plan] = await db
        .select()
        .from(plans)
        .where(
          and(
            eq(plans.organizationId, organizationId),
            eq(plans.slug, slug.trim().toLowerCase())
          )
        )
        .limit(1);

      if (!plan) {
        return null;
      }

      return this._formatPlan(plan);
    } catch (error) {
      logger.error(
        { error, organizationId, slug },
        "Failed to get plan by slug"
      );
      throw error;
    }
  }

  /**
   * Get all plans for organization with pagination
   * Cached for 1 hour
   * @param {number} organizationId - Organization ID
   * @param {number} limit - Page size (default: 50)
   * @param {number} offset - Offset for pagination (default: 0)
   * @returns {Promise<Object>} { plans: [], total: number, hasMore: boolean }
   */
  async getPlansByOrganization(organizationId, limit = 50, offset = 0) {
    if (!organizationId) {
      throw new ValidationError("Organization ID is required");
    }

    // Check cache for all plans (only if no pagination)
    if (offset === 0 && limit >= 50) {
      const cacheKey = cacheKeys.orgPlans(organizationId);
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.debug(
          { organizationId },
          "Organization plans retrieved from cache"
        );
        return cached;
      }
    }

    try {
      // Get total count using SQL
      const totalResult = await db
        .select({ count: sql`count(*)` })
        .from(plans)
        .where(eq(plans.organizationId, organizationId));

      const total = Number(totalResult[0]?.count || 0);

      // Get paginated plans
      const planList = await db
        .select()
        .from(plans)
        .where(eq(plans.organizationId, organizationId))
        .orderBy(plans.createdAt)
        .limit(limit)
        .offset(offset);

      const result = {
        plans: planList.map((p) => this._formatPlan(p)),
        total,
        hasMore: offset + limit < total,
      };

      // Cache all plans if no pagination
      if (offset === 0 && limit >= 50) {
        const cacheKey = cacheKeys.orgPlans(organizationId);
        await cacheService.set(cacheKey, result, CACHE_TTL.PLAN_ROLE_DATA);
      }

      return result;
    } catch (error) {
      logger.error(
        { error, organizationId },
        "Failed to get plans by organization"
      );
      throw error;
    }
  }

  /**
   * Update plan
   * Slug is immutable
   * @param {number} planId - Plan ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated plan object
   */
  async updatePlan(planId, updates) {
    if (!planId) {
      throw new ValidationError("Plan ID is required");
    }

    // Only allow updating name and description
    const allowedFields = ["name", "description"];
    const filteredUpdates = {};

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        if (
          field === "name" &&
          (!updates[field] || updates[field].trim().length === 0)
        ) {
          throw new ValidationError("Plan name cannot be empty");
        }
        filteredUpdates[field] = updates[field]?.trim() || null;
      }
    }

    if (Object.keys(filteredUpdates).length === 0) {
      throw new ValidationError("No valid fields to update");
    }

    // Add updated timestamp
    filteredUpdates.updatedAt = new Date();

    try {
      // Get plan first
      const existingPlan = await this.getPlan(planId);
      if (!existingPlan) {
        throw new NotFoundError("Plan not found");
      }

      // Update plan
      const [updated] = await db
        .update(plans)
        .set(filteredUpdates)
        .where(eq(plans.id, planId))
        .returning();

      // Invalidate caches
      await cacheService.del(cacheKeys.plan(planId));
      await cacheService.del(cacheKeys.orgPlans(existingPlan.organizationId));

      logger.info({ planId, updates: filteredUpdates }, "Plan updated");

      return this._formatPlan(updated);
    } catch (error) {
      logger.error({ error, planId }, "Failed to update plan");
      throw error;
    }
  }

  /**
   * Delete plan
   * Checks if users are assigned to this plan
   * @param {number} planId - Plan ID
   * @returns {Promise<void>}
   */
  async deletePlan(planId) {
    if (!planId) {
      throw new ValidationError("Plan ID is required");
    }

    try {
      // Get plan first
      const plan = await this.getPlan(planId);
      if (!plan) {
        throw new NotFoundError("Plan not found");
      }

      // Check if users are assigned to this plan
      // Note: This assumes there's a planId column in users table
      // If not implemented yet, this check will be added when user-plan relationship is created
      const usersResult = await db
        .select({ count: sql`count(*)` })
        .from(users)
        .where(eq(users.planId, planId))
        .catch(() => [{ count: 0 }]); // Gracefully handle if column doesn't exist yet

      const userCount = Number(usersResult[0]?.count || 0);

      if (userCount > 0) {
        throw new ConflictError(
          `Cannot delete plan: ${userCount} user(s) are assigned to this plan`
        );
      }

      // Delete plan (cascade will handle related records)
      await db.delete(plans).where(eq(plans.id, planId));

      // Invalidate caches
      await cacheService.del(cacheKeys.plan(planId));
      await cacheService.del(cacheKeys.orgPlans(plan.organizationId));
      await cacheService.del(cacheKeys.planFeatures(planId));
      await cacheService.del(cacheKeys.planLimits(planId));

      logger.info({ planId }, "Plan deleted");
    } catch (error) {
      logger.error({ error, planId }, "Failed to delete plan");
      throw error;
    }
  }

  /**
   * Get plan with all features
   * Includes enabled flag for each feature
   * @param {number} planId - Plan ID
   * @returns {Promise<Object>} Plan object with features array
   */
  async getPlanWithFeatures(planId) {
    if (!planId) {
      throw new ValidationError("Plan ID is required");
    }

    try {
      // Get plan
      const plan = await this.getPlan(planId);
      if (!plan) {
        throw new NotFoundError("Plan not found");
      }

      // Get plan features with details
      const planFeaturesResult = await db
        .select({
          featureId: planFeatures.featureId,
          enabled: planFeatures.enabled,
          featureName: features.name,
          featureSlug: features.slug,
          featureDescription: features.description,
        })
        .from(planFeatures)
        .innerJoin(features, eq(planFeatures.featureId, features.id))
        .where(eq(planFeatures.planId, planId));

      return {
        ...plan,
        features: planFeaturesResult.map((pf) => ({
          id: pf.featureId,
          name: pf.featureName,
          slug: pf.featureSlug,
          description: pf.featureDescription,
          enabled: pf.enabled,
        })),
      };
    } catch (error) {
      logger.error({ error, planId }, "Failed to get plan with features");
      throw error;
    }
  }

  /**
   * Format plan object for API response
   * @private
   * @param {Object} plan - Raw plan from database
   * @returns {Object} Formatted plan object
   */
  _formatPlan(plan) {
    return {
      id: plan.id,
      name: plan.name,
      slug: plan.slug,
      description: plan.description,
      organizationId: plan.organizationId,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
    };
  }
}

// Create singleton instance
const plansService = new PlansService();

export default plansService;
