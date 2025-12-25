import { eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { plans, planFeatures, planLimits } from "../db/schema.js";
import type { Plan, NewPlan, PlanUpdate } from "../types/db.js";
import { cacheService, CacheTTL } from "./cache.service.js";
import {
  planKey,
  planFeaturesKey,
  planLimitsKey,
} from "../utils/cache-keys.js";
import { isDevelopment } from "../config/environment.js";

/**
 * Pagination options
 */
export interface PaginationOptions {
  limit?: number;
  offset?: number;
}

/**
 * Plan list result with pagination metadata
 */
export interface PlanListResult {
  plans: Plan[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Plan Service
 * Manages plans which define feature access and limits
 */
class PlanService {
  /**
   * Create a new plan
   * @param name - Plan display name
   * @param slug - Unique plan identifier (within the system, globally unique)
   * @param description - Optional description
   * @returns Created plan
   */
  async createPlan(
    name: string,
    slug: string,
    description?: string | null
  ): Promise<Plan> {
    // Check for duplicate slug
    const existing = await this.getPlanBySlug(slug);
    if (existing) {
      throw new Error(`Plan with slug "${slug}" already exists`);
    }

    const newPlan: NewPlan = {
      name,
      slug,
      description: description ?? null,
    };

    const created = await db.insert(plans).values(newPlan).returning();

    const result = created[0];
    if (!result) {
      throw new Error("Failed to create plan");
    }

    if (isDevelopment) {
      console.log(`[PlanService] Created plan: ${slug}`);
    }

    return result;
  }

  /**
   * Get plan by ID
   * @param planId - Plan ID
   * @returns Plan or null
   */
  async getPlanById(planId: number): Promise<Plan | null> {
    // Try cache first
    const cacheKey = planKey(planId);
    const cached = await cacheService.get<Plan>(cacheKey);
    if (cached) {
      return cached;
    }

    const result = await db
      .select()
      .from(plans)
      .where(eq(plans.id, planId))
      .limit(1);

    const plan = result[0] ?? null;

    // Cache the result
    if (plan) {
      await cacheService.set(cacheKey, plan, CacheTTL.PLANS);
    }

    return plan;
  }

  /**
   * Get plan by slug
   * @param slug - Plan slug
   * @returns Plan or null
   */
  async getPlanBySlug(slug: string): Promise<Plan | null> {
    const result = await db
      .select()
      .from(plans)
      .where(eq(plans.slug, slug))
      .limit(1);

    const plan = result[0] ?? null;

    // Cache the result if found
    if (plan) {
      await cacheService.set(planKey(plan.id), plan, CacheTTL.PLANS);
    }

    return plan;
  }

  /**
   * Get plan by ID or slug
   * @param idOrSlug - Plan ID (number) or slug (string)
   * @returns Plan or null
   */
  async getPlan(idOrSlug: number | string): Promise<Plan | null> {
    if (typeof idOrSlug === "number") {
      return this.getPlanById(idOrSlug);
    }

    // Try parsing as number first
    const parsed = parseInt(idOrSlug, 10);
    if (!isNaN(parsed)) {
      return this.getPlanById(parsed);
    }

    // Otherwise treat as slug
    return this.getPlanBySlug(idOrSlug);
  }

  /**
   * Get all plans with pagination
   * @param options - Pagination options
   * @returns Plan list with metadata
   */
  async getAllPlans(options: PaginationOptions = {}): Promise<PlanListResult> {
    const { limit = 50, offset = 0 } = options;

    const planList = await db
      .select()
      .from(plans)
      .limit(limit)
      .offset(offset)
      .orderBy(plans.name);

    const countResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(plans);

    const total = countResult[0]?.count ?? 0;

    return {
      plans: planList,
      total,
      limit,
      offset,
    };
  }

  /**
   * Update a plan
   * Note: slug is immutable and cannot be changed
   * @param planId - Plan ID
   * @param updates - Partial updates (name, description only)
   * @returns Updated plan
   */
  async updatePlan(planId: number, updates: PlanUpdate): Promise<Plan> {
    const existing = await this.getPlanById(planId);
    if (!existing) {
      throw new Error(`Plan not found: ${planId}`);
    }

    const result = await db
      .update(plans)
      .set({
        name: updates.name ?? existing.name,
        description: updates.description ?? existing.description,
        updatedAt: new Date(),
      })
      .where(eq(plans.id, planId))
      .returning();

    const updated = result[0];
    if (!updated) {
      throw new Error(`Failed to update plan: ${planId}`);
    }

    // Invalidate cache
    await cacheService.del(planKey(planId));

    if (isDevelopment) {
      console.log(`[PlanService] Updated plan: ${existing.slug}`);
    }

    return updated;
  }

  /**
   * Delete a plan
   * @param planId - Plan ID
   */
  async deletePlan(planId: number): Promise<void> {
    const existing = await this.getPlanById(planId);
    if (!existing) {
      throw new Error(`Plan not found: ${planId}`);
    }

    // Check if plan has any features or limits (optional check)
    const featureCount = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(planFeatures)
      .where(eq(planFeatures.planId, planId));

    if ((featureCount[0]?.count ?? 0) > 0) {
      // Remove features first
      await db.delete(planFeatures).where(eq(planFeatures.planId, planId));
    }

    const limitCount = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(planLimits)
      .where(eq(planLimits.planId, planId));

    if ((limitCount[0]?.count ?? 0) > 0) {
      // Remove limits first
      await db.delete(planLimits).where(eq(planLimits.planId, planId));
    }

    // Delete the plan
    await db.delete(plans).where(eq(plans.id, planId));

    // Invalidate caches
    await cacheService.del([
      planKey(planId),
      planFeaturesKey(planId),
      planLimitsKey(planId),
    ]);

    if (isDevelopment) {
      console.log(`[PlanService] Deleted plan: ${existing.slug}`);
    }
  }

  /**
   * Check if a plan exists
   * @param planId - Plan ID
   * @returns True if plan exists
   */
  async planExists(planId: number): Promise<boolean> {
    const plan = await this.getPlanById(planId);
    return plan !== null;
  }

  /**
   * Check if a plan slug is available
   * @param slug - Plan slug
   * @returns True if slug is available
   */
  async isSlugAvailable(slug: string): Promise<boolean> {
    const existing = await this.getPlanBySlug(slug);
    return existing === null;
  }
}

/**
 * Singleton plan service instance
 */
export const planService = new PlanService();
