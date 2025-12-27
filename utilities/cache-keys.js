/**
 * Cache key generators for consistent cache key formatting
 * All keys follow a consistent pattern: prefix:identifier
 */

export const cacheKeys = {
  /**
   * User cache key
   * @param {string|number} userId - User ID
   * @returns {string} Cache key
   */
  user: (userId) => `user:${userId}`,

  /**
   * Organization cache key
   * @param {number} orgId - Organization ID
   * @returns {string} Cache key
   */
  organization: (orgId) => `org:${orgId}`,

  /**
   * Feature cache key (by ID or slug)
   * @param {string|number} identifier - Feature ID or slug
   * @returns {string} Cache key
   */
  feature: (identifier) => `feature:${identifier}`,

  /**
   * Plan cache key
   * @param {number} planId - Plan ID
   * @returns {string} Cache key
   */
  plan: (planId) => `plan:${planId}`,

  /**
   * Role cache key
   * @param {number} roleId - Role ID
   * @returns {string} Cache key
   */
  role: (roleId) => `role:${roleId}`,

  /**
   * User permissions cache key
   * TTL: 5 minutes (changes frequently)
   * @param {string} userId - User ID (Clerk ID - string)
   * @param {number} orgId - Organization ID
   * @returns {string} Cache key
   */
  userPermissions: (userId, orgId) => `permissions:${userId}:${orgId}`,

  /**
   * User usage cache key
   * TTL: 5 minutes (updates frequently)
   * @param {string} userId - User ID (Clerk ID - string)
   * @returns {string} Cache key
   */
  userUsage: (userId) => `usage:${userId}`,

  /**
   * Organization features cache key
   * TTL: 24 hours (static)
   * @param {number} orgId - Organization ID
   * @returns {string} Cache key
   */
  orgFeatures: (orgId) => `org:features:${orgId}`,

  /**
   * Organization plans cache key
   * TTL: 1 hour (changes rarely)
   * @param {number} orgId - Organization ID
   * @returns {string} Cache key
   */
  orgPlans: (orgId) => `org:plans:${orgId}`,

  /**
   * User usage for specific feature
   * TTL: 5 minutes
   * @param {string} userId - User ID (Clerk ID - string)
   * @param {string} featureSlug - Feature slug
   * @returns {string} Cache key
   */
  userUsageForFeature: (userId, featureSlug) => `usage:${userId}:${featureSlug}`,

  /**
   * Plan features cache key
   * TTL: 1 hour
   * @param {number} planId - Plan ID
   * @returns {string} Cache key
   */
  planFeatures: (planId) => `plan:features:${planId}`,

  /**
   * Plan limits cache key
   * TTL: 1 hour
   * @param {number} planId - Plan ID
   * @returns {string} Cache key
   */
  planLimits: (planId) => `plan:limits:${planId}`,

  /**
   * Role permissions cache key
   * TTL: 1 hour
   * @param {number} roleId - Role ID
   * @returns {string} Cache key
   */
  rolePermissions: (roleId) => `role:permissions:${roleId}`,

  /**
   * User roles cache key
   * TTL: 30 minutes
   * @param {string} userId - User ID (Clerk ID - string)
   * @param {number} orgId - Organization ID
   * @returns {string} Cache key
   */
  userRoles: (userId, orgId) => `user:roles:${userId}:${orgId}`,

  /**
   * User overrides cache key
   * TTL: 5 minutes
   * @param {string} userId - User ID (Clerk ID - string)
   * @returns {string} Cache key
   */
  userOverrides: (userId) => `overrides:user:${userId}`,

  /**
   * Organization overrides cache key
   * TTL: 5 minutes
   * @param {number} orgId - Organization ID
   * @returns {string} Cache key
   */
  orgOverrides: (orgId) => `overrides:org:${orgId}`
};

/**
 * Cache TTL constants (in seconds)
 */
export const CACHE_TTL = {
  PERMISSIONS: 300,      // 5 minutes - changes frequently
  USAGE: 300,            // 5 minutes - updates frequently
  USER_ROLES: 1800,      // 30 minutes
  PLAN_ROLE_DATA: 3600,  // 1 hour - changes rarely
  FEATURES: 86400        // 24 hours - static
};

export default cacheKeys;


