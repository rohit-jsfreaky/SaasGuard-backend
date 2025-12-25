/**
 * Permission Resolution Service
 * CORE of SaaS Guard - resolves what a user can and cannot do
 */

import type {
  PermissionMap,
  PermissionContext,
  PermissionCheckResult,
} from "../types/permissions.js";
import { cacheService, CacheTTL } from "./cache.service.js";
import { userRoleService } from "./user-role.service.js";
import { planFeatureService } from "./plan-feature.service.js";
import { planLimitService } from "./plan-limit.service.js";
import { overrideService } from "./override.service.js";
import { organizationOverrideService } from "./organization-override.service.js";
import { usageService } from "./usage.service.js";
import { resolvedPermissionsKey } from "../utils/cache-keys.js";
import {
  mergeFeatures,
  applyAllOverrides,
  calculateAllLimits,
  featureMapToRecord,
  canPerformAction,
} from "../utils/permission-resolver.js";
import { isDevelopment } from "../config/environment.js";

/**
 * Permission Resolution Service
 * The core engine that determines user permissions
 */
class PermissionResolutionService {
  /**
   * Resolve all permissions for a user in an organization
   * This is the CORE method of SaaS Guard
   *
   * Priority: OVERRIDES > ROLES > PLAN > DEFAULT
   *
   * @param userId - User ID
   * @param orgId - Organization ID
   * @param planId - Optional plan ID (if known)
   * @returns Resolved permission map
   */
  async resolvePermissions(
    userId: number,
    orgId: number,
    planId?: number
  ): Promise<PermissionMap> {
    const startTime = Date.now();

    // Try cache first
    const cacheKey = resolvedPermissionsKey(userId, orgId);
    const cached = await cacheService.get<PermissionMap>(cacheKey);
    if (cached) {
      if (isDevelopment) {
        console.log(
          `[PermissionResolution] Cache hit for user ${userId} in org ${orgId}`
        );
      }
      return { ...cached, cached: true };
    }

    if (isDevelopment) {
      console.log(
        `[PermissionResolution] Resolving permissions for user ${userId} in org ${orgId}`
      );
    }

    // Build permission context by loading all data
    const context = await this.buildContext(userId, orgId, planId);

    // Resolve features: Plan → Org Overrides → Roles → User Overrides
    let features = mergeFeatures(context.planFeatures, context.rolePermissions);
    features = applyAllOverrides(
      features,
      context.organizationOverrides,
      context.userOverrides
    );

    // Calculate limits with usage
    const limits = calculateAllLimits(context);

    // Build permission map
    const permissionMap: PermissionMap = {
      features: featureMapToRecord(features),
      limits,
      resolvedAt: new Date(),
      userId,
      orgId,
      cached: false,
    };

    // Cache the result
    await cacheService.set(cacheKey, permissionMap, CacheTTL.PERMISSIONS);

    if (isDevelopment) {
      const duration = Date.now() - startTime;
      console.log(
        `[PermissionResolution] Resolved ${
          Object.keys(permissionMap.features).length
        } features and ${Object.keys(limits).length} limits in ${duration}ms`
      );
    }

    return permissionMap;
  }

  /**
   * Build the permission context by loading all relevant data
   * @param userId - User ID
   * @param orgId - Organization ID
   * @param planId - Optional plan ID
   * @returns Permission context
   */
  private async buildContext(
    userId: number,
    orgId: number,
    planId?: number
  ): Promise<PermissionContext> {
    // Load data in parallel for performance
    const [
      userRolePermissions,
      userOverrides,
      organizationOverrides,
      userUsage,
    ] = await Promise.all([
      userRoleService.getUserRolePermissions(userId, orgId),
      overrideService.getActiveOverrides(userId),
      organizationOverrideService.getActiveOrganizationOverrides(orgId),
      usageService.getUserUsage(userId),
    ]);

    // Build role permissions set
    const rolePermissions = new Set<string>(userRolePermissions);

    // Build user override map
    const userOverrideMap = new Map<
      string,
      { type: string; value: string | null }
    >();
    for (const override of userOverrides) {
      userOverrideMap.set(override.featureSlug, {
        type: override.overrideType,
        value: override.value,
      });
    }

    // Build organization override map
    const orgOverrideMap = new Map<
      string,
      { type: string; value: string | null }
    >();
    for (const override of organizationOverrides) {
      orgOverrideMap.set(override.featureSlug, {
        type: override.overrideType,
        value: override.value,
      });
    }

    // Build usage map
    const usageMap = new Map<string, number>();
    for (const record of userUsage) {
      usageMap.set(record.featureSlug, record.currentUsage);
    }

    // Load plan features and limits (if plan ID provided)
    let planFeatures = new Map<string, boolean>();
    let planLimits = new Map<string, number>();

    if (planId) {
      const [planFeaturesData, planLimitsData] = await Promise.all([
        planFeatureService.getPlanFeatures(planId),
        planLimitService.getPlanLimits(planId),
      ]);

      // Build plan features map
      for (const pf of planFeaturesData) {
        planFeatures.set(pf.feature.slug, pf.enabled);
      }

      // Build plan limits map
      for (const pl of planLimitsData) {
        planLimits.set(pl.featureSlug, pl.maxLimit);
      }
    }

    return {
      userId,
      orgId,
      planFeatures,
      planLimits,
      rolePermissions,
      userOverrides: userOverrideMap,
      organizationOverrides: orgOverrideMap,
      usage: usageMap,
    };
  }

  /**
   * Check if a user can perform a specific action
   * @param userId - User ID
   * @param orgId - Organization ID
   * @param featureSlug - Feature to check
   * @param planId - Optional plan ID
   * @returns Permission check result
   */
  async checkPermission(
    userId: number,
    orgId: number,
    featureSlug: string,
    planId?: number
  ): Promise<PermissionCheckResult> {
    const permissions = await this.resolvePermissions(userId, orgId, planId);
    return canPerformAction(
      permissions.features,
      permissions.limits,
      featureSlug
    );
  }

  /**
   * Check multiple permissions at once
   * @param userId - User ID
   * @param orgId - Organization ID
   * @param featureSlugs - Features to check
   * @param planId - Optional plan ID
   * @returns Map of feature slug to allowed status
   */
  async checkMultiplePermissions(
    userId: number,
    orgId: number,
    featureSlugs: string[],
    planId?: number
  ): Promise<Record<string, PermissionCheckResult>> {
    const permissions = await this.resolvePermissions(userId, orgId, planId);
    const results: Record<string, PermissionCheckResult> = {};

    for (const slug of featureSlugs) {
      results[slug] = canPerformAction(
        permissions.features,
        permissions.limits,
        slug
      );
    }

    return results;
  }

  /**
   * Invalidate cached permissions for a user
   * Call this when user's permissions may have changed
   * @param userId - User ID
   * @param orgId - Organization ID
   */
  async invalidatePermissions(userId: number, orgId: number): Promise<void> {
    await cacheService.del(resolvedPermissionsKey(userId, orgId));

    if (isDevelopment) {
      console.log(
        `[PermissionResolution] Invalidated cache for user ${userId} in org ${orgId}`
      );
    }
  }

  /**
   * Invalidate all cached permissions for a user (all orgs)
   * @param userId - User ID
   */
  async invalidateAllUserPermissions(userId: number): Promise<void> {
    await cacheService.clearPattern(`permissions:${userId}:*`);

    if (isDevelopment) {
      console.log(
        `[PermissionResolution] Invalidated all permission cache for user ${userId}`
      );
    }
  }

  /**
   * Get a single feature permission quickly
   * Uses cached permissions if available
   * @param userId - User ID
   * @param orgId - Organization ID
   * @param featureSlug - Feature to check
   * @param planId - Optional plan ID
   * @returns Whether feature is allowed
   */
  async isFeatureAllowed(
    userId: number,
    orgId: number,
    featureSlug: string,
    planId?: number
  ): Promise<boolean> {
    const permissions = await this.resolvePermissions(userId, orgId, planId);
    return permissions.features[featureSlug] ?? false;
  }

  /**
   * Check if a user is within usage limits for a feature
   * @param userId - User ID
   * @param orgId - Organization ID
   * @param featureSlug - Feature to check
   * @param planId - Optional plan ID
   * @returns Whether user is within limits
   */
  async isWithinLimits(
    userId: number,
    orgId: number,
    featureSlug: string,
    planId?: number
  ): Promise<boolean> {
    const permissions = await this.resolvePermissions(userId, orgId, planId);
    const limit = permissions.limits[featureSlug];

    if (!limit) {
      return true; // No limit = unlimited
    }

    return !limit.exceeded;
  }

  /**
   * Get remaining usage for a feature
   * @param userId - User ID
   * @param orgId - Organization ID
   * @param featureSlug - Feature to check
   * @param planId - Optional plan ID
   * @returns Remaining usage or null if unlimited
   */
  async getRemainingUsage(
    userId: number,
    orgId: number,
    featureSlug: string,
    planId?: number
  ): Promise<number | null> {
    const permissions = await this.resolvePermissions(userId, orgId, planId);
    const limit = permissions.limits[featureSlug];

    if (!limit) {
      return null; // Unlimited
    }

    return limit.remaining;
  }
}

/**
 * Singleton permission resolution service instance
 */
export const permissionResolutionService = new PermissionResolutionService();
