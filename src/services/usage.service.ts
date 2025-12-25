import { eq, and, sql, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import { usage } from "../db/schema.js";
import type { Usage, NewUsage } from "../types/db.js";
import { cacheService, CacheTTL } from "./cache.service.js";
import { userUsageKey } from "../utils/cache-keys.js";
import { isDevelopment } from "../config/environment.js";

/**
 * Usage Service
 * Tracks and manages feature usage for users
 */
class UsageService {
  /**
   * Record usage for a feature
   * @param userId - User ID
   * @param featureSlug - Feature slug
   * @param amount - Amount to increment (default: 1)
   * @returns Updated usage record
   */
  async recordUsage(
    userId: number,
    featureSlug: string,
    amount: number = 1
  ): Promise<Usage> {
    // Check for existing usage record
    const existing = await this.getUsage(userId, featureSlug);

    if (existing) {
      // Increment existing usage
      const result = await db
        .update(usage)
        .set({
          currentUsage: sql`${usage.currentUsage} + ${amount}`,
          updatedAt: new Date(),
        })
        .where(
          and(eq(usage.userId, userId), eq(usage.featureSlug, featureSlug))
        )
        .returning();

      const updated = result[0];
      if (!updated) {
        throw new Error("Failed to update usage");
      }

      await this.invalidateCache(userId);

      if (isDevelopment) {
        console.log(
          `[UsageService] Recorded usage: ${featureSlug} +${amount} for user ${userId} (total: ${updated.currentUsage})`
        );
      }

      return updated;
    }

    // Create new usage record
    const newUsage: NewUsage = {
      userId,
      featureSlug,
      currentUsage: amount,
      periodStart: new Date(),
    };

    const created = await db.insert(usage).values(newUsage).returning();

    const result = created[0];
    if (!result) {
      throw new Error("Failed to create usage record");
    }

    await this.invalidateCache(userId);

    if (isDevelopment) {
      console.log(
        `[UsageService] Created usage: ${featureSlug} = ${amount} for user ${userId}`
      );
    }

    return result;
  }

  /**
   * Get usage for a specific feature
   * @param userId - User ID
   * @param featureSlug - Feature slug
   * @returns Usage record or null
   */
  async getUsage(userId: number, featureSlug: string): Promise<Usage | null> {
    const result = await db
      .select()
      .from(usage)
      .where(and(eq(usage.userId, userId), eq(usage.featureSlug, featureSlug)))
      .limit(1);

    return result[0] ?? null;
  }

  /**
   * Get current usage count for a feature
   * @param userId - User ID
   * @param featureSlug - Feature slug
   * @returns Usage count (0 if no record)
   */
  async getUsageCount(userId: number, featureSlug: string): Promise<number> {
    const record = await this.getUsage(userId, featureSlug);
    return record?.currentUsage ?? 0;
  }

  /**
   * Get all usage records for a user
   * @param userId - User ID
   * @returns List of usage records
   */
  async getUserUsage(userId: number): Promise<Usage[]> {
    // Try cache first
    const cacheKey = userUsageKey(userId);
    const cached = await cacheService.get<Usage[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const result = await db
      .select()
      .from(usage)
      .where(eq(usage.userId, userId))
      .orderBy(usage.featureSlug);

    // Cache the result
    await cacheService.set(cacheKey, result, CacheTTL.USAGE);

    return result;
  }

  /**
   * Get user usage as a map of feature slug to count
   * @param userId - User ID
   * @returns Map of feature slug to usage count
   */
  async getUserUsageMap(userId: number): Promise<Map<string, number>> {
    const records = await this.getUserUsage(userId);
    const usageMap = new Map<string, number>();

    for (const record of records) {
      usageMap.set(record.featureSlug, record.currentUsage);
    }

    return usageMap;
  }

  /**
   * Reset usage for a specific feature
   * @param userId - User ID
   * @param featureSlug - Feature slug
   */
  async resetUsage(userId: number, featureSlug: string): Promise<void> {
    await db
      .update(usage)
      .set({
        currentUsage: 0,
        periodStart: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(usage.userId, userId), eq(usage.featureSlug, featureSlug)));

    await this.invalidateCache(userId);

    if (isDevelopment) {
      console.log(
        `[UsageService] Reset usage: ${featureSlug} for user ${userId}`
      );
    }
  }

  /**
   * Reset all usage for a user
   * @param userId - User ID
   */
  async resetAllUsageForUser(userId: number): Promise<void> {
    await db
      .update(usage)
      .set({
        currentUsage: 0,
        periodStart: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(usage.userId, userId));

    await this.invalidateCache(userId);

    if (isDevelopment) {
      console.log(`[UsageService] Reset all usage for user ${userId}`);
    }
  }

  /**
   * Bulk get usage for multiple users (optimized batch query)
   * @param userIds - Array of user IDs
   * @param featureSlug - Feature slug
   * @returns Map of userId to usage count
   */
  async bulkGetUsage(
    userIds: number[],
    featureSlug: string
  ): Promise<Map<number, number>> {
    if (userIds.length === 0) {
      return new Map();
    }

    const result = await db
      .select({
        userId: usage.userId,
        currentUsage: usage.currentUsage,
      })
      .from(usage)
      .where(
        and(inArray(usage.userId, userIds), eq(usage.featureSlug, featureSlug))
      );

    const usageMap = new Map<number, number>();

    // Initialize all users with 0
    for (const userId of userIds) {
      usageMap.set(userId, 0);
    }

    // Update with actual usage
    for (const record of result) {
      usageMap.set(record.userId, record.currentUsage);
    }

    return usageMap;
  }

  /**
   * Reset all monthly usage (for scheduled job)
   * @returns Number of records reset
   */
  async resetAllMonthlyUsage(): Promise<number> {
    const result = await db
      .update(usage)
      .set({
        currentUsage: 0,
        periodStart: new Date(),
        updatedAt: new Date(),
      })
      .returning({ id: usage.id });

    // Clear all usage caches
    await cacheService.clearPattern("usage:*");

    if (isDevelopment) {
      console.log(
        `[UsageService] Reset monthly usage for ${result.length} records`
      );
    }

    return result.length;
  }

  /**
   * Delete usage record
   * @param userId - User ID
   * @param featureSlug - Feature slug
   */
  async deleteUsage(userId: number, featureSlug: string): Promise<void> {
    await db
      .delete(usage)
      .where(and(eq(usage.userId, userId), eq(usage.featureSlug, featureSlug)));

    await this.invalidateCache(userId);
  }

  /**
   * Delete all usage for a user
   * @param userId - User ID
   */
  async deleteAllUserUsage(userId: number): Promise<void> {
    await db.delete(usage).where(eq(usage.userId, userId));

    await this.invalidateCache(userId);
  }

  /**
   * Get usage statistics for a feature (admin view)
   * @param featureSlug - Feature slug
   * @returns Usage statistics
   */
  async getFeatureUsageStats(featureSlug: string): Promise<{
    totalUsers: number;
    totalUsage: number;
    avgUsage: number;
  }> {
    const result = await db
      .select({
        totalUsers: sql<number>`count(*)::int`,
        totalUsage: sql<number>`sum(${usage.currentUsage})::int`,
        avgUsage: sql<number>`avg(${usage.currentUsage})::float`,
      })
      .from(usage)
      .where(eq(usage.featureSlug, featureSlug));

    const stats = result[0];
    return {
      totalUsers: stats?.totalUsers ?? 0,
      totalUsage: stats?.totalUsage ?? 0,
      avgUsage: Math.round(stats?.avgUsage ?? 0),
    };
  }

  /**
   * Invalidate cache for a user's usage
   */
  private async invalidateCache(userId: number): Promise<void> {
    await cacheService.del(userUsageKey(userId));
  }
}

/**
 * Singleton usage service instance
 */
export const usageService = new UsageService();
