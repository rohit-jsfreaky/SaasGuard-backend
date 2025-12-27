import { clerkClient } from '@clerk/express';
import logger from '../utilities/logger.js';
import { UnauthorizedError } from '../utilities/errors.js';
import cacheService from './cache.service.js';
import cacheKeys from '../utilities/cache-keys.js';
import { CACHE_TTL } from '../utilities/cache-keys.js';

/**
 * ClerkService - Handles Clerk user management
 * Uses clerkClient from @clerk/express for API calls
 * Token verification is handled by clerkMiddleware() - no need to verify manually
 */
class ClerkService {

  /**
   * Get user information from Clerk API
   * Results are cached for 1 hour
   * @param {string} userId - Clerk user ID (string)
   * @returns {Promise<Object>} - User object: { id, email, firstName, lastName }
   * @throws {UnauthorizedError} - If user not found
   */
  async getUserInfo(userId) {
    if (!userId) {
      throw new UnauthorizedError('User ID is required');
    }

    // Check cache first
    const cacheKey = cacheKeys.user(userId);
    const cached = await cacheService.get(cacheKey);

    if (cached) {
      logger.debug({ userId }, 'User info retrieved from cache');
      return cached;
    }

    try {
      // Fetch from Clerk API using clerkClient from @clerk/express
      const user = await clerkClient.users.getUser(userId);

      if (!user) {
        throw new UnauthorizedError('User not found');
      }

      // Format user object
      const userInfo = {
        id: user.id, // Clerk user ID (string)
        email: user.emailAddresses?.[0]?.emailAddress || null,
        firstName: user.firstName || null,
        lastName: user.lastName || null,
        imageUrl: user.imageUrl || null,
        createdAt: user.createdAt || null
      };

      // Cache for 1 hour
      await cacheService.set(cacheKey, userInfo, CACHE_TTL.PLAN_ROLE_DATA); // 1 hour

      logger.debug({ userId }, 'User info fetched from Clerk API');

      return userInfo;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to fetch user info from Clerk');

      if (error instanceof UnauthorizedError) {
        throw error;
      }

      // Handle Clerk-specific errors
      if (error.name === 'ClerkError') {
        if (error.message?.includes('not found')) {
          throw new UnauthorizedError('User not found');
        }
        throw new UnauthorizedError('Failed to fetch user information');
      }

      throw new UnauthorizedError('Failed to retrieve user information');
    }
  }

  /**
   * Invalidate user cache
   * Call this when user information might have changed
   * @param {string} userId - Clerk user ID (string)
   * @returns {Promise<void>}
   */
  async invalidateUserCache(userId) {
    const cacheKey = cacheKeys.user(userId);
    await cacheService.del(cacheKey);
    logger.debug({ userId }, 'User cache invalidated');
  }
}

// Create singleton instance
const clerkService = new ClerkService();

// Export clerkClient for direct access if needed
export { clerkClient };

export default clerkService;
