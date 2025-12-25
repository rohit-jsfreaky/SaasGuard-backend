import { eq, and, gt, isNull, or, lt } from "drizzle-orm";
import { db } from "../db/index.js";
import { overrides } from "../db/schema.js";
import type { Override, NewOverride } from "../types/db.js";
import { cacheService, CacheTTL } from "./cache.service.js";
import { userOverridesKey } from "../utils/cache-keys.js";
import { isDevelopment } from "../config/environment.js";
import type { OverrideType } from "../validators/override.validator.js";

/**
 * Override Service
 * Manages user-level overrides for features - exceptions to plan rules
 */
class OverrideService {
  /**
   * Create a new user override
   * @param userId - User ID
   * @param featureSlug - Feature slug
   * @param overrideType - Type of override
   * @param value - Override value (string representation)
   * @param expiresAt - Optional expiration date
   * @param createdBy - User who created the override
   * @returns Created override
   */
  async createOverride(
    userId: number,
    featureSlug: string,
    overrideType: OverrideType,
    value?: string | null,
    expiresAt?: Date | null,
    createdBy?: number
  ): Promise<Override> {
    // Check for existing active override for this feature
    const existing = await this.getOverrideForFeature(userId, featureSlug);
    if (existing) {
      // Update existing instead
      const updateData: {
        overrideType?: OverrideType;
        value?: string | null;
        expiresAt?: Date | null;
      } = { overrideType };
      if (value !== undefined) updateData.value = value;
      if (expiresAt !== undefined) updateData.expiresAt = expiresAt;
      return this.updateOverride(existing.id, updateData);
    }

    const newOverride: NewOverride = {
      userId,
      featureSlug,
      overrideType,
      value: value ?? null,
      expiresAt: expiresAt ?? null,
      createdBy: createdBy ?? null,
    };

    const created = await db.insert(overrides).values(newOverride).returning();

    const result = created[0];
    if (!result) {
      throw new Error("Failed to create override");
    }

    await this.invalidateCache(userId);

    if (isDevelopment) {
      console.log(
        `[OverrideService] Created override: ${overrideType} for ${featureSlug} on user ${userId}`
      );
    }

    return result;
  }

  /**
   * Get all active (non-expired) overrides for a user
   * @param userId - User ID
   * @returns List of active overrides
   */
  async getActiveOverrides(userId: number): Promise<Override[]> {
    // Try cache first
    const cacheKey = userOverridesKey(userId);
    const cached = await cacheService.get<Override[]>(cacheKey);
    if (cached) {
      // Filter out expired ones from cache
      const now = new Date();
      return cached.filter((o) => !o.expiresAt || new Date(o.expiresAt) > now);
    }

    const now = new Date();
    const result = await db
      .select()
      .from(overrides)
      .where(
        and(
          eq(overrides.userId, userId),
          or(isNull(overrides.expiresAt), gt(overrides.expiresAt, now))
        )
      )
      .orderBy(overrides.featureSlug);

    // Cache the result
    await cacheService.set(cacheKey, result, CacheTTL.OVERRIDES);

    return result;
  }

  /**
   * Get active override for a specific feature
   * @param userId - User ID
   * @param featureSlug - Feature slug
   * @returns Override or null
   */
  async getOverrideForFeature(
    userId: number,
    featureSlug: string
  ): Promise<Override | null> {
    const now = new Date();
    const result = await db
      .select()
      .from(overrides)
      .where(
        and(
          eq(overrides.userId, userId),
          eq(overrides.featureSlug, featureSlug),
          or(isNull(overrides.expiresAt), gt(overrides.expiresAt, now))
        )
      )
      .limit(1);

    return result[0] ?? null;
  }

  /**
   * Get override by ID
   * @param overrideId - Override ID
   * @returns Override or null
   */
  async getOverrideById(overrideId: number): Promise<Override | null> {
    const result = await db
      .select()
      .from(overrides)
      .where(eq(overrides.id, overrideId))
      .limit(1);

    return result[0] ?? null;
  }

  /**
   * Update an override
   * @param overrideId - Override ID
   * @param updates - Partial updates
   * @returns Updated override
   */
  async updateOverride(
    overrideId: number,
    updates: Partial<{
      overrideType: OverrideType;
      value: string | null;
      expiresAt: Date | null;
    }>
  ): Promise<Override> {
    const existing = await this.getOverrideById(overrideId);
    if (!existing) {
      throw new Error(`Override not found: ${overrideId}`);
    }

    const result = await db
      .update(overrides)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(overrides.id, overrideId))
      .returning();

    const updated = result[0];
    if (!updated) {
      throw new Error(`Failed to update override: ${overrideId}`);
    }

    await this.invalidateCache(existing.userId);

    if (isDevelopment) {
      console.log(`[OverrideService] Updated override: ${overrideId}`);
    }

    return updated;
  }

  /**
   * Delete an override
   * @param overrideId - Override ID
   */
  async deleteOverride(overrideId: number): Promise<void> {
    const existing = await this.getOverrideById(overrideId);
    if (!existing) {
      throw new Error(`Override not found: ${overrideId}`);
    }

    await db.delete(overrides).where(eq(overrides.id, overrideId));

    await this.invalidateCache(existing.userId);

    if (isDevelopment) {
      console.log(`[OverrideService] Deleted override: ${overrideId}`);
    }
  }

  /**
   * Expire an override immediately
   * @param overrideId - Override ID
   */
  async expireOverride(overrideId: number): Promise<void> {
    const existing = await this.getOverrideById(overrideId);
    if (!existing) {
      throw new Error(`Override not found: ${overrideId}`);
    }

    await db
      .update(overrides)
      .set({
        expiresAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(overrides.id, overrideId));

    await this.invalidateCache(existing.userId);

    if (isDevelopment) {
      console.log(`[OverrideService] Expired override: ${overrideId}`);
    }
  }

  /**
   * List all overrides for a feature (admin view)
   * @param featureSlug - Feature slug
   * @param limit - Maximum results
   * @returns List of overrides
   */
  async listOverridesForFeature(
    featureSlug: string,
    limit: number = 50
  ): Promise<Override[]> {
    const result = await db
      .select()
      .from(overrides)
      .where(eq(overrides.featureSlug, featureSlug))
      .limit(limit)
      .orderBy(overrides.createdAt);

    return result;
  }

  /**
   * Get all overrides for a user (including expired)
   * @param userId - User ID
   * @param limit - Maximum results
   * @returns List of all overrides
   */
  async getAllUserOverrides(
    userId: number,
    limit: number = 50
  ): Promise<Override[]> {
    const result = await db
      .select()
      .from(overrides)
      .where(eq(overrides.userId, userId))
      .limit(limit)
      .orderBy(overrides.createdAt);

    return result;
  }

  /**
   * Check if user has an enabled feature override
   * @param userId - User ID
   * @param featureSlug - Feature slug
   * @returns True if feature is explicitly enabled
   */
  async isFeatureEnabled(
    userId: number,
    featureSlug: string
  ): Promise<boolean | null> {
    const override = await this.getOverrideForFeature(userId, featureSlug);
    if (!override) {
      return null; // No override
    }

    if (override.overrideType === "feature_enable") {
      return true;
    }
    if (override.overrideType === "feature_disable") {
      return false;
    }

    return null; // Limit override doesn't affect enable/disable
  }

  /**
   * Get limit override value
   * @param userId - User ID
   * @param featureSlug - Feature slug
   * @returns Override limit or null
   */
  async getLimitOverride(
    userId: number,
    featureSlug: string
  ): Promise<number | null> {
    const override = await this.getOverrideForFeature(userId, featureSlug);
    if (!override || override.overrideType !== "limit_increase") {
      return null;
    }

    const value = parseInt(override.value ?? "", 10);
    return isNaN(value) ? null : value;
  }

  /**
   * Cleanup expired overrides (background job)
   * @returns Number of deleted overrides
   */
  async cleanupExpiredOverrides(): Promise<number> {
    const now = new Date();
    const result = await db
      .delete(overrides)
      .where(lt(overrides.expiresAt, now))
      .returning({ id: overrides.id });

    if (isDevelopment && result.length > 0) {
      console.log(
        `[OverrideService] Cleaned up ${result.length} expired overrides`
      );
    }

    return result.length;
  }

  /**
   * Invalidate cache for a user's overrides
   */
  private async invalidateCache(userId: number): Promise<void> {
    await cacheService.del(userOverridesKey(userId));
  }
}

/**
 * Singleton override service instance
 */
export const overrideService = new OverrideService();
