import { eq, and } from "drizzle-orm";
import db from "../config/db.js";
import { planLimits } from "../models/plan-limits.model.js";
import logger from "../utilities/logger.js";
import { ValidationError } from "../utilities/errors.js";
import cacheService from "./cache.service.js";
import cacheKeys from "../utilities/cache-keys.js";
import { CACHE_TTL } from "../utilities/cache-keys.js";

/**
 * PlanLimitsService - Handles usage limits for features within plans
 * Limits are optional (null = unlimited)
 */
class PlanLimitsService {
  /**
   * Set or update limit for feature in plan
   * Upsert behavior - creates if doesn't exist, updates if exists
   * @param {number} planId - Plan ID
   * @param {string} featureSlug - Feature slug
   * @param {number} maxLimit - Maximum limit value
   * @returns {Promise<Object>} Limit object
   */
  async setLimitForFeature(planId, featureSlug, maxLimit) {
    if (!planId) {
      throw new ValidationError("Plan ID is required");
    }

    if (!featureSlug || featureSlug.trim().length === 0) {
      throw new ValidationError("Feature slug is required");
    }

    if (maxLimit === null || maxLimit === undefined) {
      throw new ValidationError(
        "Max limit is required (use removeLimitForFeature for unlimited)"
      );
    }

    if (typeof maxLimit !== "number" || maxLimit < 0) {
      throw new ValidationError("Max limit must be a non-negative number");
    }

    try {
      // Check if limit already exists
      const [existing] = await db
        .select()
        .from(planLimits)
        .where(
          and(
            eq(planLimits.planId, planId),
            eq(planLimits.featureSlug, featureSlug)
          )
        )
        .limit(1);

      let result;

      if (existing) {
        // Update existing limit
        [result] = await db
          .update(planLimits)
          .set({
            maxLimit,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(planLimits.planId, planId),
              eq(planLimits.featureSlug, featureSlug)
            )
          )
          .returning();

        logger.info(
          { planId, featureSlug, maxLimit },
          "Limit updated for feature"
        );
      } else {
        // Create new limit
        [result] = await db
          .insert(planLimits)
          .values({
            planId,
            featureSlug,
            maxLimit,
          })
          .returning();

        logger.info(
          { planId, featureSlug, maxLimit },
          "Limit created for feature"
        );
      }

      // Invalidate cache
      await cacheService.del(cacheKeys.planLimits(planId));

      return this._formatLimit(result);
    } catch (error) {
      logger.error(
        { error, planId, featureSlug, maxLimit },
        "Failed to set limit for feature"
      );

      // Handle unique constraint violation (race condition)
      if (error.code === "23505" || error.message?.includes("unique")) {
        // Retry as update
        const [result] = await db
          .update(planLimits)
          .set({
            maxLimit,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(planLimits.planId, planId),
              eq(planLimits.featureSlug, featureSlug)
            )
          )
          .returning();

        await cacheService.del(cacheKeys.planLimits(planId));
        return this._formatLimit(result);
      }

      throw error;
    }
  }

  /**
   * Get limit for feature in plan
   * Cached for 1 hour
   * @param {number} planId - Plan ID
   * @param {string} featureSlug - Feature slug
   * @returns {Promise<Object|null>} Limit object or null if unlimited
   */
  async getLimitForFeature(planId, featureSlug) {
    if (!planId) {
      throw new ValidationError("Plan ID is required");
    }

    if (!featureSlug || featureSlug.trim().length === 0) {
      throw new ValidationError("Feature slug is required");
    }

    try {
      const [limit] = await db
        .select()
        .from(planLimits)
        .where(
          and(
            eq(planLimits.planId, planId),
            eq(planLimits.featureSlug, featureSlug)
          )
        )
        .limit(1);

      if (!limit) {
        return null; // Unlimited
      }

      return this._formatLimit(limit);
    } catch (error) {
      logger.error(
        { error, planId, featureSlug },
        "Failed to get limit for feature"
      );
      throw error;
    }
  }

  /**
   * Get all limits for plan
   * Cached for 1 hour
   * @param {number} planId - Plan ID
   * @returns {Promise<Array>} Array of limit objects
   */
  async getPlanLimits(planId) {
    if (!planId) {
      throw new ValidationError("Plan ID is required");
    }

    // Check cache first
    const cacheKey = cacheKeys.planLimits(planId);
    const cached = await cacheService.get(cacheKey);

    if (cached) {
      logger.debug({ planId }, "Plan limits retrieved from cache");
      return cached;
    }

    try {
      const limits = await db
        .select()
        .from(planLimits)
        .where(eq(planLimits.planId, planId));

      const result = limits.map((limit) => ({
        featureSlug: limit.featureSlug,
        maxLimit: limit.maxLimit,
      }));

      // Cache for 1 hour
      await cacheService.set(cacheKey, result, CACHE_TTL.PLAN_ROLE_DATA);

      return result;
    } catch (error) {
      logger.error({ error, planId }, "Failed to get plan limits");
      throw error;
    }
  }

  /**
   * Remove limit for feature (makes unlimited)
   * @param {number} planId - Plan ID
   * @param {string} featureSlug - Feature slug
   * @returns {Promise<Object>} Success response
   */
  async removeLimitForFeature(planId, featureSlug) {
    if (!planId) {
      throw new ValidationError("Plan ID is required");
    }

    if (!featureSlug || featureSlug.trim().length === 0) {
      throw new ValidationError("Feature slug is required");
    }

    try {
      await db
        .delete(planLimits)
        .where(
          and(
            eq(planLimits.planId, planId),
            eq(planLimits.featureSlug, featureSlug)
          )
        );

      // Invalidate cache
      await cacheService.del(cacheKeys.planLimits(planId));

      logger.info({ planId, featureSlug }, "Limit removed for feature");

      return { success: true };
    } catch (error) {
      logger.error(
        { error, planId, featureSlug },
        "Failed to remove limit for feature"
      );
      throw error;
    }
  }

  /**
   * Get numeric limit value for feature
   * Cached for 1 hour
   * @param {number} planId - Plan ID
   * @param {string} featureSlug - Feature slug
   * @returns {Promise<number|null>} Limit value or null if unlimited
   */
  async getLimitByFeature(planId, featureSlug) {
    const limit = await this.getLimitForFeature(planId, featureSlug);
    return limit?.maxLimit || null;
  }

  /**
   * Format limit object for API response
   * @private
   * @param {Object} limit - Raw limit from database
   * @returns {Object} Formatted limit object
   */
  _formatLimit(limit) {
    return {
      id: limit.id,
      planId: limit.planId,
      featureSlug: limit.featureSlug,
      maxLimit: limit.maxLimit,
      createdAt: limit.createdAt,
      updatedAt: limit.updatedAt,
    };
  }
}

// Create singleton instance
const planLimitsService = new PlanLimitsService();

export default planLimitsService;
