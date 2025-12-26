/**
 * Cache Key Utilities
 * Provides consistent key naming patterns for all cached data
 */

const PREFIX = "saasguard";

/**
 * Generate cache key for user permissions
 * @param userId - User ID
 * @param organizationId - Organization ID (optional)
 */
export function userPermissionsKey(
  userId: string,
  organizationId?: number
): string {
  if (organizationId) {
    return `${PREFIX}:user:${userId}:org:${organizationId}:permissions`;
  }
  return `${PREFIX}:user:${userId}:permissions`;
}

/**
 * Generate cache key for user usage data
 * @param userId - User ID
 * @param featureSlug - Optional feature slug for specific feature usage
 */
export function userUsageKey(userId: string, featureSlug?: string): string {
  if (featureSlug) {
    return `${PREFIX}:user:${userId}:usage:${featureSlug}`;
  }
  return `${PREFIX}:user:${userId}:usage`;
}

/**
 * Generate cache key for user roles
 * @param userId - User ID
 * @param organizationId - Organization ID
 */
export function userRolesKey(userId: string, organizationId: number): string {
  return `${PREFIX}:user:${userId}:org:${organizationId}:roles`;
}

/**
 * Generate cache key for user overrides
 * @param userId - User ID
 */
export function userOverridesKey(userId: string): string {
  return `${PREFIX}:user:${userId}:overrides`;
}

/**
 * Generate cache key for organization features
 * @param organizationId - Organization ID
 */
export function orgFeaturesKey(organizationId: number): string {
  return `${PREFIX}:org:${organizationId}:features`;
}

/**
 * Generate cache key for organization plans
 * @param organizationId - Organization ID
 */
export function orgPlansKey(organizationId: number): string {
  return `${PREFIX}:org:${organizationId}:plans`;
}

/**
 * Generate cache key for organization roles
 * @param organizationId - Organization ID
 */
export function orgRolesKey(organizationId: number): string {
  return `${PREFIX}:org:${organizationId}:roles`;
}

/**
 * Generate cache key for organization overrides
 * @param organizationId - Organization ID
 */
export function orgOverridesKey(organizationId: number): string {
  return `${PREFIX}:org:${organizationId}:overrides`;
}

/**
 * Generate cache key for organization overrides (alias)
 * @param organizationId - Organization ID
 */
export function organizationOverridesKey(organizationId: number): string {
  return `${PREFIX}:org:${organizationId}:overrides`;
}

/**
 * Generate cache key for a specific feature
 * @param featureId - Feature ID
 */
export function featureKey(featureId: number): string {
  return `${PREFIX}:feature:${featureId}`;
}

/**
 * Generate cache key for a feature by slug
 * @param slug - Feature slug
 */
export function featureBySlugKey(slug: string): string {
  return `${PREFIX}:feature:slug:${slug}`;
}

/**
 * Generate cache key for all features list
 */
export function allFeaturesKey(): string {
  return `${PREFIX}:features:all`;
}

/**
 * Generate cache key for a specific plan
 * @param planId - Plan ID
 */
export function planKey(planId: number): string {
  return `${PREFIX}:plan:${planId}`;
}

/**
 * Generate cache key for plan features
 * @param planId - Plan ID
 */
export function planFeaturesKey(planId: number): string {
  return `${PREFIX}:plan:${planId}:features`;
}

/**
 * Generate cache key for plan limits
 * @param planId - Plan ID
 */
export function planLimitsKey(planId: number): string {
  return `${PREFIX}:plan:${planId}:limits`;
}

/**
 * Generate cache key for a specific role
 * @param roleId - Role ID
 */
export function roleKey(roleId: number): string {
  return `${PREFIX}:role:${roleId}`;
}

/**
 * Generate cache key for role permissions
 * @param roleId - Role ID
 */
export function rolePermissionsKey(roleId: number): string {
  return `${PREFIX}:role:${roleId}:permissions`;
}

/**
 * Generate cache key for resolved permission map
 * @param userId - User ID
 * @param orgId - Organization ID
 */
export function resolvedPermissionsKey(userId: string, orgId: number): string {
  return `${PREFIX}:permissions:${userId}:${orgId}`;
}

/**
 * Cache key patterns for bulk invalidation
 */
export const CachePatterns = {
  /** All user-related keys for a specific user */
  userAll: (userId: string) => `${PREFIX}:user:${userId}:*`,

  /** All organization-related keys */
  orgAll: (organizationId: number) => `${PREFIX}:org:${organizationId}:*`,

  /** All feature-related keys */
  featuresAll: () => `${PREFIX}:feature*`,

  /** All plan-related keys */
  plansAll: () => `${PREFIX}:plan:*`,

  /** All role-related keys */
  rolesAll: () => `${PREFIX}:role:*`,

  /** All keys (use with caution) */
  all: () => `${PREFIX}:*`,
} as const;
