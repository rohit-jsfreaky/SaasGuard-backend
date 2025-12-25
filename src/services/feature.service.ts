import { eq, sql, ilike, or } from "drizzle-orm";
import { db } from "../db/index.js";
import { features, planFeatures, rolePermissions } from "../db/schema.js";
import type { Feature, NewFeature, FeatureUpdate } from "../types/db.js";
import { cacheService, CacheTTL } from "./cache.service.js";
import {
  featureKey,
  featureBySlugKey,
  allFeaturesKey,
} from "../utils/cache-keys.js";
import { isValidSlug } from "../validators/feature.validator.js";
import { isDevelopment } from "../config/environment.js";

/**
 * Pagination options
 */
export interface PaginationOptions {
  limit?: number;
  offset?: number;
}

/**
 * Feature list result with pagination metadata
 */
export interface FeatureListResult {
  features: Feature[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Feature Service
 * Manages the feature registry - a catalog of all atomic actions in the platform
 */
class FeatureService {
  /**
   * Create a new feature
   * @param name - Feature display name
   * @param slug - Unique feature identifier (immutable)
   * @param description - Optional description
   * @returns Created feature
   */
  async createFeature(
    name: string,
    slug: string,
    description?: string | null
  ): Promise<Feature> {
    // Validate slug format
    if (!isValidSlug(slug)) {
      throw new Error(
        "Invalid slug format. Must be lowercase, start with a letter, and contain only letters, numbers, and hyphens."
      );
    }

    // Check for duplicate slug
    const existing = await this.getFeatureBySlug(slug);
    if (existing) {
      throw new Error(`Feature with slug "${slug}" already exists`);
    }

    const newFeature: NewFeature = {
      name,
      slug,
      description: description ?? null,
    };

    const created = await db.insert(features).values(newFeature).returning();

    const result = created[0];
    if (!result) {
      throw new Error("Failed to create feature");
    }

    // Invalidate all features cache
    await cacheService.del(allFeaturesKey());

    if (isDevelopment) {
      console.log(`[FeatureService] Created feature: ${slug}`);
    }

    return result;
  }

  /**
   * Get feature by ID
   * @param featureId - Feature ID
   * @returns Feature or null
   */
  async getFeatureById(featureId: number): Promise<Feature | null> {
    // Try cache first
    const cacheKey = featureKey(featureId);
    const cached = await cacheService.get<Feature>(cacheKey);
    if (cached) {
      return cached;
    }

    const result = await db
      .select()
      .from(features)
      .where(eq(features.id, featureId))
      .limit(1);

    const feature = result[0] ?? null;

    // Cache the result
    if (feature) {
      await cacheService.set(cacheKey, feature, CacheTTL.FEATURES);
    }

    return feature;
  }

  /**
   * Get feature by slug
   * @param slug - Feature slug
   * @returns Feature or null
   */
  async getFeatureBySlug(slug: string): Promise<Feature | null> {
    // Try cache first
    const cacheKey = featureBySlugKey(slug);
    const cached = await cacheService.get<Feature>(cacheKey);
    if (cached) {
      return cached;
    }

    const result = await db
      .select()
      .from(features)
      .where(eq(features.slug, slug))
      .limit(1);

    const feature = result[0] ?? null;

    // Cache the result
    if (feature) {
      await cacheService.set(cacheKey, feature, CacheTTL.FEATURES);
      // Also cache by ID
      await cacheService.set(
        featureKey(feature.id),
        feature,
        CacheTTL.FEATURES
      );
    }

    return feature;
  }

  /**
   * Get feature by ID or slug
   * @param idOrSlug - Feature ID (number) or slug (string)
   * @returns Feature or null
   */
  async getFeature(idOrSlug: number | string): Promise<Feature | null> {
    if (typeof idOrSlug === "number") {
      return this.getFeatureById(idOrSlug);
    }

    // Try parsing as number first
    const parsed = parseInt(idOrSlug, 10);
    if (!isNaN(parsed)) {
      return this.getFeatureById(parsed);
    }

    // Otherwise treat as slug
    return this.getFeatureBySlug(idOrSlug);
  }

  /**
   * Get all features with pagination
   * @param options - Pagination options
   * @returns Feature list with metadata
   */
  async getAllFeatures(
    options: PaginationOptions = {}
  ): Promise<FeatureListResult> {
    const { limit = 50, offset = 0 } = options;

    // Get features with pagination
    const featureList = await db
      .select()
      .from(features)
      .limit(limit)
      .offset(offset)
      .orderBy(features.name);

    // Get total count
    const countResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(features);

    const total = countResult[0]?.count ?? 0;

    return {
      features: featureList,
      total,
      limit,
      offset,
    };
  }

  /**
   * Update a feature
   * Note: slug is immutable and cannot be changed
   * @param featureId - Feature ID
   * @param updates - Partial updates (name, description only)
   * @returns Updated feature
   */
  async updateFeature(
    featureId: number,
    updates: FeatureUpdate
  ): Promise<Feature> {
    // Get existing feature first
    const existing = await this.getFeatureById(featureId);
    if (!existing) {
      throw new Error(`Feature not found: ${featureId}`);
    }

    const result = await db
      .update(features)
      .set({
        name: updates.name ?? existing.name,
        description: updates.description ?? existing.description,
        updatedAt: new Date(),
      })
      .where(eq(features.id, featureId))
      .returning();

    const updated = result[0];
    if (!updated) {
      throw new Error(`Failed to update feature: ${featureId}`);
    }

    // Invalidate cache
    await cacheService.del([
      featureKey(featureId),
      featureBySlugKey(existing.slug),
      allFeaturesKey(),
    ]);

    if (isDevelopment) {
      console.log(`[FeatureService] Updated feature: ${existing.slug}`);
    }

    return updated;
  }

  /**
   * Delete a feature
   * Fails if feature is used in any plans or roles
   * @param featureId - Feature ID
   */
  async deleteFeature(featureId: number): Promise<void> {
    // Get existing feature first
    const existing = await this.getFeatureById(featureId);
    if (!existing) {
      throw new Error(`Feature not found: ${featureId}`);
    }

    // Check if feature is used in any plans
    const planUsage = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(planFeatures)
      .where(eq(planFeatures.featureId, featureId));

    if ((planUsage[0]?.count ?? 0) > 0) {
      throw new Error(
        `Cannot delete feature "${existing.slug}" - it is used in ${planUsage[0]?.count} plan(s)`
      );
    }

    // Check if feature is used in any role permissions
    const roleUsage = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(rolePermissions)
      .where(eq(rolePermissions.featureSlug, existing.slug));

    if ((roleUsage[0]?.count ?? 0) > 0) {
      throw new Error(
        `Cannot delete feature "${existing.slug}" - it is used in ${roleUsage[0]?.count} role permission(s)`
      );
    }

    // Delete the feature
    await db.delete(features).where(eq(features.id, featureId));

    // Invalidate cache
    await cacheService.del([
      featureKey(featureId),
      featureBySlugKey(existing.slug),
      allFeaturesKey(),
    ]);

    if (isDevelopment) {
      console.log(`[FeatureService] Deleted feature: ${existing.slug}`);
    }
  }

  /**
   * Search features by name or description
   * @param query - Search query
   * @param options - Pagination options
   * @returns Matching features
   */
  async searchFeatures(
    query: string,
    options: PaginationOptions = {}
  ): Promise<FeatureListResult> {
    const { limit = 50, offset = 0 } = options;
    const searchPattern = `%${query}%`;

    const featureList = await db
      .select()
      .from(features)
      .where(
        or(
          ilike(features.name, searchPattern),
          ilike(features.slug, searchPattern),
          ilike(features.description, searchPattern)
        )
      )
      .limit(limit)
      .offset(offset)
      .orderBy(features.name);

    // Get total count for search
    const countResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(features)
      .where(
        or(
          ilike(features.name, searchPattern),
          ilike(features.slug, searchPattern),
          ilike(features.description, searchPattern)
        )
      );

    const total = countResult[0]?.count ?? 0;

    return {
      features: featureList,
      total,
      limit,
      offset,
    };
  }

  /**
   * Check if a feature exists
   * @param featureId - Feature ID
   * @returns True if feature exists
   */
  async featureExists(featureId: number): Promise<boolean> {
    const feature = await this.getFeatureById(featureId);
    return feature !== null;
  }

  /**
   * Check if a feature slug is available
   * @param slug - Feature slug
   * @returns True if slug is available
   */
  async isSlugAvailable(slug: string): Promise<boolean> {
    const existing = await this.getFeatureBySlug(slug);
    return existing === null;
  }

  /**
   * Get multiple features by their slugs
   * @param slugs - Array of feature slugs
   * @returns Map of slug to feature
   */
  async getFeaturesBySlugs(slugs: string[]): Promise<Map<string, Feature>> {
    if (slugs.length === 0) {
      return new Map();
    }

    const result = await db
      .select()
      .from(features)
      .where(sql`${features.slug} = ANY(${slugs})`);

    const featureMap = new Map<string, Feature>();
    for (const feature of result) {
      featureMap.set(feature.slug, feature);
    }

    return featureMap;
  }
}

/**
 * Singleton feature service instance
 */
export const featureService = new FeatureService();
