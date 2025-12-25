import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { planFeatures, features } from "../db/schema.js";
import type { PlanFeature, NewPlanFeature, Feature } from "../types/db.js";
import { cacheService, CacheTTL } from "./cache.service.js";
import { planFeaturesKey } from "../utils/cache-keys.js";
import { isDevelopment } from "../config/environment.js";

/**
 * Plan feature with associated feature details
 */
export interface PlanFeatureWithDetails extends PlanFeature {
  feature: Feature;
}

/**
 * Plan Feature Service
 * Manages the association between plans and features
 */
class PlanFeatureService {
  /**
   * Add a feature to a plan
   * @param planId - Plan ID
   * @param featureId - Feature ID
   * @param enabled - Whether the feature is enabled (default: true)
   */
  async addFeatureToPlan(
    planId: number,
    featureId: number,
    enabled: boolean = true
  ): Promise<PlanFeature> {
    // Check if already exists
    const existing = await db
      .select()
      .from(planFeatures)
      .where(
        and(
          eq(planFeatures.planId, planId),
          eq(planFeatures.featureId, featureId)
        )
      )
      .limit(1);

    if (existing[0]) {
      // Update if exists
      const updated = await db
        .update(planFeatures)
        .set({ enabled })
        .where(
          and(
            eq(planFeatures.planId, planId),
            eq(planFeatures.featureId, featureId)
          )
        )
        .returning();

      await this.invalidateCache(planId);
      return updated[0]!;
    }

    // Create new
    const newPlanFeature: NewPlanFeature = {
      planId,
      featureId,
      enabled,
    };

    const created = await db
      .insert(planFeatures)
      .values(newPlanFeature)
      .returning();

    const result = created[0];
    if (!result) {
      throw new Error("Failed to add feature to plan");
    }

    await this.invalidateCache(planId);

    if (isDevelopment) {
      console.log(
        `[PlanFeatureService] Added feature ${featureId} to plan ${planId}`
      );
    }

    return result;
  }

  /**
   * Remove a feature from a plan
   * @param planId - Plan ID
   * @param featureId - Feature ID
   */
  async removeFeatureFromPlan(
    planId: number,
    featureId: number
  ): Promise<void> {
    const result = await db
      .delete(planFeatures)
      .where(
        and(
          eq(planFeatures.planId, planId),
          eq(planFeatures.featureId, featureId)
        )
      )
      .returning({ id: planFeatures.id });

    if (result.length === 0) {
      throw new Error(`Feature ${featureId} not found in plan ${planId}`);
    }

    await this.invalidateCache(planId);

    if (isDevelopment) {
      console.log(
        `[PlanFeatureService] Removed feature ${featureId} from plan ${planId}`
      );
    }
  }

  /**
   * Get all features for a plan
   * @param planId - Plan ID
   * @returns List of plan features with feature details
   */
  async getPlanFeatures(planId: number): Promise<PlanFeatureWithDetails[]> {
    // Try cache first
    const cacheKey = planFeaturesKey(planId);
    const cached = await cacheService.get<PlanFeatureWithDetails[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const result = await db
      .select({
        id: planFeatures.id,
        planId: planFeatures.planId,
        featureId: planFeatures.featureId,
        enabled: planFeatures.enabled,
        createdAt: planFeatures.createdAt,
        feature: features,
      })
      .from(planFeatures)
      .innerJoin(features, eq(planFeatures.featureId, features.id))
      .where(eq(planFeatures.planId, planId))
      .orderBy(features.name);

    const planFeaturesList = result.map((row) => ({
      id: row.id,
      planId: row.planId,
      featureId: row.featureId,
      enabled: row.enabled,
      createdAt: row.createdAt,
      feature: row.feature,
    }));

    // Cache the result
    await cacheService.set(cacheKey, planFeaturesList, CacheTTL.PLANS);

    return planFeaturesList;
  }

  /**
   * Get enabled features for a plan (as a Set of slugs)
   * @param planId - Plan ID
   * @returns Set of enabled feature slugs
   */
  async getEnabledFeatureSlugs(planId: number): Promise<Set<string>> {
    const planFeaturesList = await this.getPlanFeatures(planId);
    const enabledSlugs = new Set<string>();

    for (const pf of planFeaturesList) {
      if (pf.enabled) {
        enabledSlugs.add(pf.feature.slug);
      }
    }

    return enabledSlugs;
  }

  /**
   * Check if a feature is enabled for a plan
   * @param planId - Plan ID
   * @param featureSlug - Feature slug
   * @returns True if feature is enabled
   */
  async isFeatureEnabled(
    planId: number,
    featureSlug: string
  ): Promise<boolean> {
    const enabledSlugs = await this.getEnabledFeatureSlugs(planId);
    return enabledSlugs.has(featureSlug);
  }

  /**
   * Toggle feature enabled status
   * @param planId - Plan ID
   * @param featureId - Feature ID
   * @param enabled - New enabled status
   */
  async setFeatureEnabled(
    planId: number,
    featureId: number,
    enabled: boolean
  ): Promise<void> {
    const result = await db
      .update(planFeatures)
      .set({ enabled })
      .where(
        and(
          eq(planFeatures.planId, planId),
          eq(planFeatures.featureId, featureId)
        )
      )
      .returning({ id: planFeatures.id });

    if (result.length === 0) {
      throw new Error(`Feature ${featureId} not found in plan ${planId}`);
    }

    await this.invalidateCache(planId);
  }

  /**
   * Invalidate cache for a plan's features
   */
  private async invalidateCache(planId: number): Promise<void> {
    await cacheService.del(planFeaturesKey(planId));
  }
}

/**
 * Singleton plan feature service instance
 */
export const planFeatureService = new PlanFeatureService();
