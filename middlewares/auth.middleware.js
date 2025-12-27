import { clerkMiddleware, requireAuth } from '@clerk/express';
import { UnauthorizedError } from '../utilities/errors.js';
import logger from '../utilities/logger.js';

/**
 * Clerk authentication middleware
 * Uses @clerk/express package to handle authentication
 * Clerk user IDs are STRINGS, not integers
 */
export const clerkAuthMiddleware = clerkMiddleware();

/**
 * Require authentication middleware
 * Ensures user is authenticated before accessing route
 */
export const requireAuthentication = requireAuth({
  onError: (error) => {
    logger.warn({ error }, 'Authentication failed');
    throw new UnauthorizedError('Authentication required');
  }
});

/**
 * Custom authentication middleware that attaches user info to request
 * Use this if you need custom user context handling
 */
export const authenticate = async (req, res, next) => {
  try {
    // @clerk/express attaches auth object to req.auth
    if (!req.auth || !req.auth.userId) {
      throw new UnauthorizedError('Authentication required');
    }

    // Clerk user IDs are STRINGS
    const userId = req.auth.userId; // This is a string
    
    // Attach user info to request
    req.userId = userId;
    req.user = {
      id: userId, // String, not integer
      sessionId: req.auth.sessionId,
      orgId: req.auth.orgId || null
    };

    next();
  } catch (error) {
    logger.warn({ error, url: req.url }, 'Authentication failed');
    
    if (error instanceof UnauthorizedError) {
      return next(error);
    }
    
    next(new UnauthorizedError('Authentication failed'));
  }
};

export default authenticate;
