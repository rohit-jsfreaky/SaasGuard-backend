/**
 * Usage Helper Functions
 * Utility functions for working with usage and limits
 */

/**
 * Check if usage limit is exceeded
 * @param {number} currentUsage - Current usage count
 * @param {number} limit - Maximum limit (null = unlimited)
 * @returns {boolean} True if limit exceeded
 */
export function isUsageLimitExceeded(currentUsage, limit) {
  if (limit === null || limit === undefined) {
    return false; // Unlimited
  }
  return currentUsage >= limit;
}

/**
 * Get remaining usage
 * @param {number} currentUsage - Current usage count
 * @param {number} limit - Maximum limit (null = unlimited)
 * @returns {number} Remaining usage (or Infinity if unlimited)
 */
export function getRemainingUsage(currentUsage, limit) {
  if (limit === null || limit === undefined) {
    return Infinity; // Unlimited
  }
  return Math.max(0, limit - currentUsage);
}

/**
 * Get usage percentage
 * @param {number} currentUsage - Current usage count
 * @param {number} limit - Maximum limit (null = unlimited)
 * @returns {number} Usage percentage (0-100, or 0 if unlimited)
 */
export function getUsagePercentage(currentUsage, limit) {
  if (limit === null || limit === undefined || limit === 0) {
    return 0; // Unlimited or no limit
  }
  return Math.min(100, Math.round((currentUsage / limit) * 100));
}

/**
 * Check if user can perform action based on usage
 * @param {number} currentUsage - Current usage count
 * @param {number} limit - Maximum limit (null = unlimited)
 * @param {number} amount - Amount to use (default: 1)
 * @returns {boolean} True if action can be performed
 */
export function canPerformAction(currentUsage, limit, amount = 1) {
  if (limit === null || limit === undefined) {
    return true; // Unlimited
  }
  return (currentUsage + amount) <= limit;
}

