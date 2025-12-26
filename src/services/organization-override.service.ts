import { eq, and, gt, isNull, or, lt } from "drizzle-orm";
import { db } from "../db/index.js";
import { organizationOverrides } from "../db/schema.js";
import type {
  OrganizationOverride,
  NewOrganizationOverride,
} from "../types/db.js";
import { cacheService, CacheTTL } from "./cache.service.js";
import { organizationOverridesKey } from "../utils/cache-keys.js";
import { isDevelopment } from "../config/environment.js";
import type { OverrideType } from "../validators/override.validator.js";

class OrganizationOverrideService {
  async createOrganizationOverride(
    organizationId: number,
    featureSlug: string,
    overrideType: OverrideType,
    value?: string | null,
    expiresAt?: Date | null,
    createdBy?: string
  ): Promise<OrganizationOverride> {
    const existing = await this.getOrganizationOverrideForFeature(
      organizationId,
      featureSlug
    );
    if (existing) {
      const updateData: {
        overrideType?: OverrideType;
        value?: string | null;
        expiresAt?: Date | null;
      } = { overrideType };
      if (value !== undefined) updateData.value = value;
      if (expiresAt !== undefined) updateData.expiresAt = expiresAt;
      return this.updateOrganizationOverride(existing.id, updateData);
    }

    const newOverride: NewOrganizationOverride = {
      organizationId,
      featureSlug,
      overrideType,
      value: value ?? null,
      expiresAt: expiresAt ?? null,
      createdBy: createdBy ?? null,
    };

    const created = await db
      .insert(organizationOverrides)
      .values(newOverride)
      .returning();

    const result = created[0];
    if (!result) {
      throw new Error("Failed to create organization override");
    }

    await this.invalidateCache(organizationId);

    if (isDevelopment) {
      console.log(
        `[OrganizationOverrideService] Created override: ${overrideType} for ${featureSlug} on organization ${organizationId}`
      );
    }

    return result;
  }

  async getActiveOrganizationOverrides(
    organizationId: number
  ): Promise<OrganizationOverride[]> {
    const cacheKey = organizationOverridesKey(organizationId);
    const cached = await cacheService.get<OrganizationOverride[]>(cacheKey);
    if (cached) {
      const now = new Date();
      return cached.filter((o) => !o.expiresAt || new Date(o.expiresAt) > now);
    }

    const now = new Date();
    const result = await db
      .select()
      .from(organizationOverrides)
      .where(
        and(
          eq(organizationOverrides.organizationId, organizationId),
          or(
            isNull(organizationOverrides.expiresAt),
            gt(organizationOverrides.expiresAt, now)
          )
        )
      )
      .orderBy(organizationOverrides.featureSlug);

    await cacheService.set(cacheKey, result, CacheTTL.OVERRIDES);

    return result;
  }

  async getOrganizationOverrideForFeature(
    organizationId: number,
    featureSlug: string
  ): Promise<OrganizationOverride | null> {
    const now = new Date();
    const result = await db
      .select()
      .from(organizationOverrides)
      .where(
        and(
          eq(organizationOverrides.organizationId, organizationId),
          eq(organizationOverrides.featureSlug, featureSlug),
          or(
            isNull(organizationOverrides.expiresAt),
            gt(organizationOverrides.expiresAt, now)
          )
        )
      )
      .limit(1);

    return result[0] ?? null;
  }

  async getOrganizationOverrideById(
    overrideId: number
  ): Promise<OrganizationOverride | null> {
    const result = await db
      .select()
      .from(organizationOverrides)
      .where(eq(organizationOverrides.id, overrideId))
      .limit(1);

    return result[0] ?? null;
  }

  async updateOrganizationOverride(
    overrideId: number,
    updates: Partial<{
      overrideType: OverrideType;
      value: string | null;
      expiresAt: Date | null;
    }>
  ): Promise<OrganizationOverride> {
    const existing = await this.getOrganizationOverrideById(overrideId);
    if (!existing) {
      throw new Error(`Organization override not found: ${overrideId}`);
    }

    const result = await db
      .update(organizationOverrides)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(organizationOverrides.id, overrideId))
      .returning();

    const updated = result[0];
    if (!updated) {
      throw new Error(
        `Failed to update organization override: ${overrideId}`
      );
    }

    await this.invalidateCache(existing.organizationId);

    if (isDevelopment) {
      console.log(
        `[OrganizationOverrideService] Updated override: ${overrideId}`
      );
    }

    return updated;
  }

  async deleteOrganizationOverride(overrideId: number): Promise<void> {
    const existing = await this.getOrganizationOverrideById(overrideId);
    if (!existing) {
      throw new Error(`Organization override not found: ${overrideId}`);
    }

    await db
      .delete(organizationOverrides)
      .where(eq(organizationOverrides.id, overrideId));

    await this.invalidateCache(existing.organizationId);

    if (isDevelopment) {
      console.log(
        `[OrganizationOverrideService] Deleted override: ${overrideId}`
      );
    }
  }

  async expireOrganizationOverride(overrideId: number): Promise<void> {
    const existing = await this.getOrganizationOverrideById(overrideId);
    if (!existing) {
      throw new Error(`Organization override not found: ${overrideId}`);
    }

    await db
      .update(organizationOverrides)
      .set({
        expiresAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(organizationOverrides.id, overrideId));

    await this.invalidateCache(existing.organizationId);

    if (isDevelopment) {
      console.log(
        `[OrganizationOverrideService] Expired override: ${overrideId}`
      );
    }
  }

  async listOrganizationOverrides(
    organizationId: number,
    limit: number = 50
  ): Promise<OrganizationOverride[]> {
    const result = await db
      .select()
      .from(organizationOverrides)
      .where(eq(organizationOverrides.organizationId, organizationId))
      .limit(limit)
      .orderBy(organizationOverrides.createdAt);

    return result;
  }

  async isFeatureEnabled(
    organizationId: number,
    featureSlug: string
  ): Promise<boolean | null> {
    const override = await this.getOrganizationOverrideForFeature(
      organizationId,
      featureSlug
    );
    if (!override) {
      return null;
    }

    if (override.overrideType === "feature_enable") {
      return true;
    }
    if (override.overrideType === "feature_disable") {
      return false;
    }

    return null;
  }

  async getLimitOverride(
    organizationId: number,
    featureSlug: string
  ): Promise<number | null> {
    const override = await this.getOrganizationOverrideForFeature(
      organizationId,
      featureSlug
    );
    if (!override || override.overrideType !== "limit_increase") {
      return null;
    }

    const value = parseInt(override.value ?? "", 10);
    return isNaN(value) ? null : value;
  }

  async cleanupExpiredOrganizationOverrides(): Promise<number> {
    const now = new Date();
    const result = await db
      .delete(organizationOverrides)
      .where(lt(organizationOverrides.expiresAt, now))
      .returning({ id: organizationOverrides.id, organizationId: organizationOverrides.organizationId });

    if (isDevelopment && result.length > 0) {
      console.log(
        `[OrganizationOverrideService] Cleaned up ${result.length} expired organization overrides`
      );
    }

    for (const row of result) {
      await this.invalidateCache(row.organizationId);
    }

    return result.length;
  }

  private async invalidateCache(organizationId: number): Promise<void> {
    await cacheService.del(organizationOverridesKey(organizationId));
  }
}

export const organizationOverrideService =
  new OrganizationOverrideService();
