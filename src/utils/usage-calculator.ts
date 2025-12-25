/**
 * Usage Calculator Utilities
 * Helper functions for checking and calculating usage limits
 */

/**
 * Check if usage limit has been exceeded
 * @param currentUsage - Current usage count
 * @param limit - Maximum allowed usage
 * @returns True if usage >= limit
 */
export function isUsageLimitExceeded(
  currentUsage: number,
  limit: number
): boolean {
  return currentUsage >= limit;
}

/**
 * Get remaining usage allowance
 * @param currentUsage - Current usage count
 * @param limit - Maximum allowed usage
 * @returns Remaining usage (0 if limit exceeded)
 */
export function getRemainingUsage(currentUsage: number, limit: number): number {
  return Math.max(0, limit - currentUsage);
}

/**
 * Calculate usage percentage
 * @param currentUsage - Current usage count
 * @param limit - Maximum allowed usage
 * @returns Usage percentage (0-100+)
 */
export function getUsagePercentage(
  currentUsage: number,
  limit: number
): number {
  if (limit <= 0) return 0;
  return Math.round((currentUsage / limit) * 100);
}

/**
 * Check if usage is approaching limit (80% threshold)
 * @param currentUsage - Current usage count
 * @param limit - Maximum allowed usage
 * @param threshold - Warning threshold (default 0.8 = 80%)
 * @returns True if usage is at or above threshold
 */
export function isApproachingLimit(
  currentUsage: number,
  limit: number,
  threshold: number = 0.8
): boolean {
  if (limit <= 0) return false;
  return currentUsage / limit >= threshold;
}

/**
 * Format usage for display
 * @param currentUsage - Current usage count
 * @param limit - Maximum allowed usage (null = unlimited)
 * @returns Formatted string like "50/100" or "50 (unlimited)"
 */
export function formatUsage(
  currentUsage: number,
  limit: number | null
): string {
  if (limit === null) {
    return `${currentUsage} (unlimited)`;
  }
  return `${currentUsage}/${limit}`;
}
