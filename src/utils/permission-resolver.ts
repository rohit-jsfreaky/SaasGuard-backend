/**
 * Permission Resolver Utilities
 * Helper functions for merging and calculating permissions
 */

import type { PermissionContext, LimitInfo } from "../types/permissions.js";

/**
 * Merge plan features with role permissions
 * Role permissions are additive - they can only grant additional features
 * @param planFeatures - Features from the plan
 * @param rolePermissions - Feature slugs granted by roles
 * @returns Merged feature map
 */
export function mergeFeatures(
  planFeatures: Map<string, boolean>,
  rolePermissions: Set<string>
): Map<string, boolean> {
  const merged = new Map<string, boolean>();

  // Start with plan features
  for (const [slug, enabled] of planFeatures) {
    merged.set(slug, enabled);
  }

  // Role permissions are additive (grant access)
  for (const slug of rolePermissions) {
    merged.set(slug, true);
  }

  return merged;
}

/**
 * Apply user overrides to feature permissions
 * Overrides have highest priority
 * @param features - Current feature permissions
 * @param overrides - User overrides
 * @returns Updated feature map
 */
export function applyFeatureOverrides(
  features: Map<string, boolean>,
  overrides: Map<string, { type: string; value: string | null }>
): Map<string, boolean> {
  const result = new Map<string, boolean>(features);

  for (const [slug, override] of overrides) {
    if (override.type === "feature_enable") {
      result.set(slug, true);
    } else if (override.type === "feature_disable") {
      result.set(slug, false);
    }
    // limit_increase doesn't affect feature enabled status
  }

  return result;
}

/**
 * Calculate limit for a feature considering overrides
 * @param planLimit - Limit from plan (null = unlimited)
 * @param override - User override (limit_increase type)
 * @param currentUsage - Current usage count
 * @returns Calculated limit info
 */
export function calculateLimit(
  planLimit: number | null,
  override: { type: string; value: string | null } | undefined,
  currentUsage: number
): LimitInfo | null {
  // Check for override limit
  let maxLimit = planLimit;

  if (override && override.type === "limit_increase" && override.value) {
    const overrideValue = parseInt(override.value, 10);
    if (!isNaN(overrideValue)) {
      // Override replaces plan limit
      maxLimit = overrideValue;
    }
  }

  // No limit = unlimited (return null)
  if (maxLimit === null) {
    return null;
  }

  const remaining = Math.max(0, maxLimit - currentUsage);

  return {
    max: maxLimit,
    used: currentUsage,
    remaining,
    exceeded: currentUsage >= maxLimit,
  };
}

/**
 * Calculate all limits from context
 * @param context - Permission context
 * @returns Map of feature slug to limit info
 */
export function calculateAllLimits(
  context: PermissionContext
): Record<string, LimitInfo> {
  const limits: Record<string, LimitInfo> = {};

  // Process all plan limits
  for (const [slug, maxLimit] of context.planLimits) {
    const override = context.userOverrides.get(slug);
    const currentUsage = context.usage.get(slug) ?? 0;

    const limitInfo = calculateLimit(maxLimit, override, currentUsage);
    if (limitInfo) {
      limits[slug] = limitInfo;
    }
  }

  // Check for override-only limits (limits on features not in plan)
  for (const [slug, override] of context.userOverrides) {
    if (override.type === "limit_increase" && !limits[slug]) {
      const currentUsage = context.usage.get(slug) ?? 0;
      const limitInfo = calculateLimit(null, override, currentUsage);
      if (limitInfo) {
        limits[slug] = limitInfo;
      }
    }
  }

  return limits;
}

/**
 * Convert feature map to record for JSON serialization
 * @param features - Feature map
 * @returns Record of slug to boolean
 */
export function featureMapToRecord(
  features: Map<string, boolean>
): Record<string, boolean> {
  const record: Record<string, boolean> = {};
  for (const [slug, enabled] of features) {
    record[slug] = enabled;
  }
  return record;
}

/**
 * Check if a specific feature is allowed
 * @param features - Resolved features
 * @param featureSlug - Feature to check
 * @param defaultValue - Default if not found
 * @returns Whether feature is allowed
 */
export function isFeatureAllowed(
  features: Record<string, boolean>,
  featureSlug: string,
  defaultValue: boolean = false
): boolean {
  return features[featureSlug] ?? defaultValue;
}

/**
 * Check if usage is within limits
 * @param limits - Resolved limits
 * @param featureSlug - Feature to check
 * @returns True if within limits (or no limit exists)
 */
export function isWithinLimits(
  limits: Record<string, LimitInfo>,
  featureSlug: string
): boolean {
  const limit = limits[featureSlug];
  if (!limit) {
    return true; // No limit = unlimited
  }
  return !limit.exceeded;
}

/**
 * Check if a user can perform an action
 * Combines feature check and limit check
 * @param features - Resolved features
 * @param limits - Resolved limits
 * @param featureSlug - Feature to check
 * @returns Permission check result
 */
export function canPerformAction(
  features: Record<string, boolean>,
  limits: Record<string, LimitInfo>,
  featureSlug: string
): { allowed: boolean; reason: string; limit?: LimitInfo } {
  // Check if feature is enabled
  const featureEnabled = features[featureSlug];
  if (featureEnabled === false) {
    return {
      allowed: false,
      reason: `Feature "${featureSlug}" is not enabled`,
    };
  }

  // Check limits
  const limit = limits[featureSlug];
  if (limit && limit.exceeded) {
    return {
      allowed: false,
      reason: `Usage limit exceeded for "${featureSlug}" (${limit.used}/${limit.max})`,
      limit,
    };
  }

  return {
    allowed: true,
    reason:
      featureEnabled !== undefined
        ? `Feature "${featureSlug}" is enabled`
        : `Feature "${featureSlug}" allowed by default`,
    ...(limit ? { limit } : {}),
  };
}
