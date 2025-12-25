import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { planLimits } from "../db/schema.js";
import type { PlanLimit, NewPlanLimit } from "../types/db.js";
import { cacheService, CacheTTL } from "./cache.service.js";
import { planLimitsKey } from "../utils/cache-keys.js";
import { isDevelopment } from "../config/environment.js";

/**
 * Plan Limit Service
 * Manages usage limits for features within plans
 */
class PlanLimitService {
  /**
   * Set or update a limit for a feature in a plan
   * @param planId - Plan ID
   * @param featureSlug - Feature slug
   * @param maxLimit - Maximum allowed usage
   * @returns Created or updated plan limit
   */
  async setLimitForFeature(
    planId: number,
    featureSlug: string,
    maxLimit: number
  ): Promise<PlanLimit> {
    // Check if limit already exists
    const existing = await db
      .select()
      .from(planLimits)
      .where(
        and(
          eq(planLimits.planId, planId),
          eq(planLimits.featureSlug, featureSlug)
        )
      )
      .limit(1);

    if (existing[0]) {
      // Update existing limit
      const updated = await db
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

      await this.invalidateCache(planId);

      if (isDevelopment) {
        console.log(
          `[PlanLimitService] Updated limit for ${featureSlug} in plan ${planId}: ${maxLimit}`
        );
      }

      return updated[0]!;
    }

    // Create new limit
    const newLimit: NewPlanLimit = {
      planId,
      featureSlug,
      maxLimit,
    };

    const created = await db.insert(planLimits).values(newLimit).returning();

    const result = created[0];
    if (!result) {
      throw new Error("Failed to set limit");
    }

    await this.invalidateCache(planId);

    if (isDevelopment) {
      console.log(
        `[PlanLimitService] Set limit for ${featureSlug} in plan ${planId}: ${maxLimit}`
      );
    }

    return result;
  }

  /**
   * Get the limit for a specific feature in a plan
   * @param planId - Plan ID
   * @param featureSlug - Feature slug
   * @returns Plan limit or null if unlimited
   */
  async getLimitForFeature(
    planId: number,
    featureSlug: string
  ): Promise<PlanLimit | null> {
    const limits = await this.getPlanLimits(planId);
    return limits.find((l) => l.featureSlug === featureSlug) ?? null;
  }

  /**
   * Get all limits for a plan
   * @param planId - Plan ID
   * @returns List of plan limits
   */
  async getPlanLimits(planId: number): Promise<PlanLimit[]> {
    // Try cache first
    const cacheKey = planLimitsKey(planId);
    const cached = await cacheService.get<PlanLimit[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const result = await db
      .select()
      .from(planLimits)
      .where(eq(planLimits.planId, planId))
      .orderBy(planLimits.featureSlug);

    // Cache the result
    await cacheService.set(cacheKey, result, CacheTTL.PLANS);

    return result;
  }

  /**
   * Get limits as a map of feature slug to max limit
   * @param planId - Plan ID
   * @returns Map of feature slug to limit
   */
  async getPlanLimitsMap(planId: number): Promise<Map<string, number>> {
    const limits = await this.getPlanLimits(planId);
    const limitsMap = new Map<string, number>();

    for (const limit of limits) {
      limitsMap.set(limit.featureSlug, limit.maxLimit);
    }

    return limitsMap;
  }

  /**
   * Remove a limit for a feature (makes it unlimited)
   * @param planId - Plan ID
   * @param featureSlug - Feature slug
   */
  async removeLimitForFeature(
    planId: number,
    featureSlug: string
  ): Promise<void> {
    const result = await db
      .delete(planLimits)
      .where(
        and(
          eq(planLimits.planId, planId),
          eq(planLimits.featureSlug, featureSlug)
        )
      )
      .returning({ id: planLimits.id });

    if (result.length === 0) {
      throw new Error(`Limit for ${featureSlug} not found in plan ${planId}`);
    }

    await this.invalidateCache(planId);

    if (isDevelopment) {
      console.log(
        `[PlanLimitService] Removed limit for ${featureSlug} from plan ${planId}`
      );
    }
  }

  /**
   * Check if usage exceeds the limit
   * @param planId - Plan ID
   * @param featureSlug - Feature slug
   * @param currentUsage - Current usage count
   * @returns True if usage exceeds limit, false if within limit or unlimited
   */
  async isLimitExceeded(
    planId: number,
    featureSlug: string,
    currentUsage: number
  ): Promise<boolean> {
    const limit = await this.getLimitForFeature(planId, featureSlug);
    if (!limit) {
      // No limit = unlimited
      return false;
    }
    return currentUsage >= limit.maxLimit;
  }

  /**
   * Get remaining usage for a feature
   * @param planId - Plan ID
   * @param featureSlug - Feature slug
   * @param currentUsage - Current usage count
   * @returns Remaining usage or null if unlimited
   */
  async getRemainingUsage(
    planId: number,
    featureSlug: string,
    currentUsage: number
  ): Promise<number | null> {
    const limit = await this.getLimitForFeature(planId, featureSlug);
    if (!limit) {
      return null; // Unlimited
    }
    return Math.max(0, limit.maxLimit - currentUsage);
  }

  /**
   * Invalidate cache for a plan's limits
   */
  private async invalidateCache(planId: number): Promise<void> {
    await cacheService.del(planLimitsKey(planId));
  }
}

/**
 * Singleton plan limit service instance
 */
export const planLimitService = new PlanLimitService();
