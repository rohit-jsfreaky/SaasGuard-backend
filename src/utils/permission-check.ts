/**
 * Permission Check Utilities
 * Helper functions for safely checking permissions
 */

import type { PermissionMap, LimitInfo } from "../types/permissions.js";

/**
 * Check if a user can perform an action
 * Safe navigation - returns false if feature not found
 * @param permissions - Resolved permission map
 * @param feature - Feature slug to check
 * @returns True if feature is enabled
 */
export function can(permissions: PermissionMap, feature: string): boolean {
  return permissions.features[feature] === true;
}

/**
 * Check if a feature is explicitly disabled
 * @param permissions - Resolved permission map
 * @param feature - Feature slug to check
 * @returns True if feature is explicitly disabled
 */
export function isDisabled(
  permissions: PermissionMap,
  feature: string
): boolean {
  return permissions.features[feature] === false;
}

/**
 * Get limit information for a feature
 * @param permissions - Resolved permission map
 * @param feature - Feature slug to check
 * @returns LimitInfo or null if unlimited/not found
 */
export function limit(
  permissions: PermissionMap,
  feature: string
): LimitInfo | null {
  return permissions.limits[feature] ?? null;
}

/**
 * Check if usage is within limits for a feature
 * @param permissions - Resolved permission map
 * @param feature - Feature slug to check
 * @returns True if within limits (or no limit exists)
 */
export function withinLimit(
  permissions: PermissionMap,
  feature: string
): boolean {
  const limitInfo = permissions.limits[feature];
  if (!limitInfo) {
    return true; // No limit = unlimited
  }
  return !limitInfo.exceeded;
}

/**
 * Check if user can proceed with an action
 * Checks both feature permission AND usage limit
 * @param permissions - Resolved permission map
 * @param feature - Feature slug to check
 * @returns True only if feature is enabled AND usage is within limits
 */
export function canProceed(
  permissions: PermissionMap,
  feature: string
): boolean {
  // Must have feature enabled
  if (!can(permissions, feature)) {
    return false;
  }

  // Must be within limits
  if (!withinLimit(permissions, feature)) {
    return false;
  }

  return true;
}

/**
 * Get remaining usage for a feature
 * @param permissions - Resolved permission map
 * @param feature - Feature slug to check
 * @returns Remaining usage or null if unlimited
 */
export function remaining(
  permissions: PermissionMap,
  feature: string
): number | null {
  const limitInfo = permissions.limits[feature];
  if (!limitInfo) {
    return null; // Unlimited
  }
  return limitInfo.remaining;
}

/**
 * Check the reason a user cannot proceed
 * @param permissions - Resolved permission map
 * @param feature - Feature slug to check
 * @returns Object with allowed status and reason
 */
export function checkReason(
  permissions: PermissionMap,
  feature: string
): {
  allowed: boolean;
  reason: string;
  code: "ALLOWED" | "FEATURE_DENIED" | "LIMIT_EXCEEDED";
} {
  // Check feature
  if (!can(permissions, feature)) {
    if (isDisabled(permissions, feature)) {
      return {
        allowed: false,
        reason: `Feature "${feature}" is not available in your plan`,
        code: "FEATURE_DENIED",
      };
    }
    return {
      allowed: false,
      reason: `Feature "${feature}" is not enabled`,
      code: "FEATURE_DENIED",
    };
  }

  // Check limits
  const limitInfo = permissions.limits[feature];
  if (limitInfo && limitInfo.exceeded) {
    return {
      allowed: false,
      reason: `You've reached your usage limit for "${feature}" (${limitInfo.used}/${limitInfo.max})`,
      code: "LIMIT_EXCEEDED",
    };
  }

  return {
    allowed: true,
    reason: "Action allowed",
    code: "ALLOWED",
  };
}

/**
 * Get multiple permission checks at once
 * @param permissions - Resolved permission map
 * @param features - Array of feature slugs
 * @returns Map of feature to allowed status
 */
export function checkMany(
  permissions: PermissionMap,
  features: string[]
): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const feature of features) {
    result[feature] = canProceed(permissions, feature);
  }
  return result;
}
