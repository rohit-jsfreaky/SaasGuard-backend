import { eq, and, sql } from "drizzle-orm";
import db from "../config/db.js";
import { planFeatures } from "../models/plan-features.model.js";
import { features } from "../models/features.model.js";
import { planLimits } from "../models/plan-limits.model.js";
import { userPlans } from "../models/user-plans.model.js";
import logger from "../utilities/logger.js";
import {
  NotFoundError,
  ValidationError,
  ConflictError,
} from "../utilities/errors.js";
import cacheService from "./cache.service.js";
import cacheKeys from "../utilities/cache-keys.js";
import { CACHE_TTL } from "../utilities/cache-keys.js";
import plansService from "./plans.service.js";

/**
 * PlanFeaturesService - Handles feature assignments to plans
 * Features are global but enabled per plan
 */
class PlanFeaturesService {
  /**
   * Add feature to plan
   * Idempotent - safe to call multiple times
   * @param {number} planId - Plan ID
   * @param {number} featureId - Feature ID
   * @param {boolean} enabled - Enabled status (default: true)
   * @returns {Promise<Object>} Success response
   */
  async addFeatureToPlan(planId, featureId, enabled = true) {
    if (!planId) {
      throw new ValidationError("Plan ID is required");
    }

    if (!featureId) {
      throw new ValidationError("Feature ID is required");
    }

    try {
      // Check if feature already in plan
      const [existing] = await db
        .select()
        .from(planFeatures)
        .where(
          and(
            eq(planFeatures.planId, planId),
            eq(planFeatures.featureId, featureId)
          )
        )
        .limit(1);

      if (existing) {
        // Idempotent - update enabled status if different
        if (existing.enabled !== enabled) {
          await db
            .update(planFeatures)
            .set({ enabled })
            .where(
              and(
                eq(planFeatures.planId, planId),
                eq(planFeatures.featureId, featureId)
              )
            );

          logger.info(
            { planId, featureId, enabled },
            "Feature enabled status updated in plan"
          );
        } else {
          logger.debug(
            { planId, featureId },
            "Feature already in plan with same status"
          );
        }
      } else {
        // Add new feature to plan
        await db.insert(planFeatures).values({
          planId,
          featureId,
          enabled,
        });

        logger.info({ planId, featureId, enabled }, "Feature added to plan");
      }

      // Invalidate caches
      await cacheService.del(cacheKeys.planFeatures(planId));

      // Also invalidate orgPlans cache since it contains featuresCount
      const plan = await plansService.getPlan(planId);
      if (plan) {
        await cacheService.del(cacheKeys.orgPlans(plan.organizationId));

        // Invalidate permission caches for all users with this plan
        await this._invalidateUserPermissionCachesForPlan(
          planId,
          plan.organizationId
        );
      }

      return { success: true };
    } catch (error) {
      logger.error(
        { error, planId, featureId },
        "Failed to add feature to plan"
      );

      // Handle unique constraint violation
      if (error.code === "23505" || error.message?.includes("unique")) {
        // Try updating instead
        await db
          .update(planFeatures)
          .set({ enabled })
          .where(
            and(
              eq(planFeatures.planId, planId),
              eq(planFeatures.featureId, featureId)
            )
          );

        await cacheService.del(cacheKeys.planFeatures(planId));
        return { success: true };
      }

      throw error;
    }
  }

  /**
   * Remove feature from plan
   * Also removes any limits for this feature
   * @param {number} planId - Plan ID
   * @param {number} featureId - Feature ID
   * @returns {Promise<Object>} Success response
   */
  async removeFeatureFromPlan(planId, featureId) {
    if (!planId) {
      throw new ValidationError("Plan ID is required");
    }

    if (!featureId) {
      throw new ValidationError("Feature ID is required");
    }

    try {
      // Get feature slug to remove limits
      const [feature] = await db
        .select()
        .from(features)
        .where(eq(features.id, featureId))
        .limit(1);

      if (!feature) {
        throw new NotFoundError("Feature not found");
      }

      // Remove feature from plan
      await db
        .delete(planFeatures)
        .where(
          and(
            eq(planFeatures.planId, planId),
            eq(planFeatures.featureId, featureId)
          )
        );

      // Remove any limits for this feature
      await db
        .delete(planLimits)
        .where(
          and(
            eq(planLimits.planId, planId),
            eq(planLimits.featureSlug, feature.slug)
          )
        );

      // Invalidate caches
      await cacheService.del(cacheKeys.planFeatures(planId));
      await cacheService.del(cacheKeys.planLimits(planId));

      // Also invalidate orgPlans cache since it contains featuresCount
      const plan = await plansService.getPlan(planId);
      if (plan) {
        await cacheService.del(cacheKeys.orgPlans(plan.organizationId));

        // Invalidate permission caches for all users with this plan
        await this._invalidateUserPermissionCachesForPlan(
          planId,
          plan.organizationId
        );
      }

      logger.info(
        { planId, featureId, featureSlug: feature.slug },
        "Feature removed from plan"
      );

      return { success: true };
    } catch (error) {
      logger.error(
        { error, planId, featureId },
        "Failed to remove feature from plan"
      );
      throw error;
    }
  }

  /**
   * Get all features in plan
   * Cached for 1 hour
   * @param {number} planId - Plan ID
   * @returns {Promise<Array>} Array of features with enabled status
   */
  async getPlanFeatures(planId) {
    if (!planId) {
      throw new ValidationError("Plan ID is required");
    }

    // Check cache first
    const cacheKey = cacheKeys.planFeatures(planId);
    const cached = await cacheService.get(cacheKey);

    if (cached) {
      logger.debug({ planId }, "Plan features retrieved from cache");
      return cached;
    }

    try {
      const featuresResult = await db
        .select({
          id: features.id,
          name: features.name,
          slug: features.slug,
          description: features.description,
          enabled: planFeatures.enabled,
        })
        .from(planFeatures)
        .innerJoin(features, eq(planFeatures.featureId, features.id))
        .where(eq(planFeatures.planId, planId));

      const result = featuresResult.map((f) => ({
        id: f.id,
        name: f.name,
        slug: f.slug,
        description: f.description,
        enabled: f.enabled,
      }));

      // Cache for 1 hour
      await cacheService.set(cacheKey, result, CACHE_TTL.PLAN_ROLE_DATA);

      return result;
    } catch (error) {
      logger.error({ error, planId }, "Failed to get plan features");
      throw error;
    }
  }

  /**
   * Toggle feature enabled/disabled in plan
   * @param {number} planId - Plan ID
   * @param {number} featureId - Feature ID
   * @param {boolean} enabled - Enabled status
   * @returns {Promise<Object>} Success response
   */
  async toggleFeatureInPlan(planId, featureId, enabled) {
    if (!planId) {
      throw new ValidationError("Plan ID is required");
    }

    if (!featureId) {
      throw new ValidationError("Feature ID is required");
    }

    if (typeof enabled !== "boolean") {
      throw new ValidationError("Enabled status must be a boolean");
    }

    try {
      // Check if feature is in plan
      const [existing] = await db
        .select()
        .from(planFeatures)
        .where(
          and(
            eq(planFeatures.planId, planId),
            eq(planFeatures.featureId, featureId)
          )
        )
        .limit(1);

      if (!existing) {
        throw new NotFoundError("Feature not found in plan");
      }

      // Update enabled status
      await db
        .update(planFeatures)
        .set({ enabled })
        .where(
          and(
            eq(planFeatures.planId, planId),
            eq(planFeatures.featureId, featureId)
          )
        );

      // Invalidate cache
      await cacheService.del(cacheKeys.planFeatures(planId));

      logger.info({ planId, featureId, enabled }, "Feature toggled in plan");

      return { success: true };
    } catch (error) {
      logger.error(
        { error, planId, featureId },
        "Failed to toggle feature in plan"
      );
      throw error;
    }
  }

  /**
   * Check if feature is in plan
   * @param {number} planId - Plan ID
   * @param {string} featureSlug - Feature slug
   * @returns {Promise<boolean>} True if feature is in plan
   */
  async featureIsInPlan(planId, featureSlug) {
    if (!planId || !featureSlug) {
      return false;
    }

    try {
      // Get feature by slug
      const [feature] = await db
        .select()
        .from(features)
        .where(eq(features.slug, featureSlug))
        .limit(1);

      if (!feature) {
        return false;
      }

      // Check if in plan
      const [planFeature] = await db
        .select()
        .from(planFeatures)
        .where(
          and(
            eq(planFeatures.planId, planId),
            eq(planFeatures.featureId, feature.id)
          )
        )
        .limit(1);

      return !!planFeature;
    } catch (error) {
      logger.error(
        { error, planId, featureSlug },
        "Failed to check if feature is in plan"
      );
      return false;
    }
  }

  /**
   * Check if feature is enabled in plan
   * @param {number} planId - Plan ID
   * @param {string} featureSlug - Feature slug
   * @returns {Promise<boolean>} True if feature is enabled in plan
   */
  async featureEnabledInPlan(planId, featureSlug) {
    if (!planId || !featureSlug) {
      return false;
    }

    try {
      // Get feature by slug
      const [feature] = await db
        .select()
        .from(features)
        .where(eq(features.slug, featureSlug))
        .limit(1);

      if (!feature) {
        return false;
      }

      // Check if enabled in plan
      const [planFeature] = await db
        .select()
        .from(planFeatures)
        .where(
          and(
            eq(planFeatures.planId, planId),
            eq(planFeatures.featureId, feature.id)
          )
        )
        .limit(1);

      return planFeature?.enabled === true;
    } catch (error) {
      logger.error(
        { error, planId, featureSlug },
        "Failed to check if feature is enabled in plan"
      );
      return false;
    }
  }

  /**
   * Invalidate permission caches for all users with a specific plan
   * @private
   * @param {number} planId - Plan ID
   * @param {number} organizationId - Organization ID
   */
  async _invalidateUserPermissionCachesForPlan(planId, organizationId) {
    try {
      // Find all users with this plan
      const usersWithPlan = await db
        .select({ userId: userPlans.userId })
        .from(userPlans)
        .where(
          and(
            eq(userPlans.planId, planId),
            eq(userPlans.organizationId, organizationId)
          )
        );

      // Invalidate each user's permission cache
      for (const { userId } of usersWithPlan) {
        await cacheService.del(
          cacheKeys.userPermissions(String(userId), organizationId)
        );
      }

      if (usersWithPlan.length > 0) {
        logger.info(
          { planId, organizationId, userCount: usersWithPlan.length },
          "Invalidated permission caches for users with plan"
        );
      }
    } catch (error) {
      logger.error(
        { error, planId, organizationId },
        "Failed to invalidate user permission caches for plan"
      );
      // Don't throw - this is a best-effort cleanup
    }
  }
}

// Create singleton instance
const planFeaturesService = new PlanFeaturesService();

export default planFeaturesService;
