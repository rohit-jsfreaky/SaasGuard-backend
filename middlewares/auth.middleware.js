import { clerkMiddleware, requireAuth, getAuth } from '@clerk/express';
import { UnauthorizedError } from '../utilities/errors.js';
import logger from '../utilities/logger.js';
import clerkService from '../services/clerk.service.js';
import config from '../config/env.js';

/**
 * Clerk authentication middleware (base)
 * Uses @clerk/express package to handle authentication
 * Clerk user IDs are STRINGS, not integers
 * This middleware must be applied globally before routes
 * It automatically verifies tokens and attaches req.auth
 * 
 * Configured to:
 * - Read tokens from Authorization header (Bearer token)
 * - Handle token verification automatically
 * - Set auth state on req.auth for use with getAuth()
 */
export const clerkAuthMiddleware = clerkMiddleware({
  // Clerk will automatically read from Authorization header
  // Format: Authorization: Bearer <token>
  secretKey: config.clerk.secretKey,
  // Allow unauthenticated requests to pass through
  // Individual routes will use authenticate() middleware to require auth
  publishableKey: process.env.CLERK_PUBLISHABLE_KEY || undefined
});

/**
 * Require authentication middleware (from @clerk/express)
 * Ensures user is authenticated before accessing route
 * Use this for simple authentication checks
 */
export const requireAuthentication = requireAuth({
  onError: (error) => {
    logger.warn({ error }, 'Authentication failed');
    throw new UnauthorizedError('Authentication required');
  }
});

/**
 * Enhanced authentication middleware
 * Uses getAuth() to get auth state from req (set by clerkMiddleware)
 * Attaches user context to request
 * 
 * IMPORTANT: This middleware must be used AFTER clerkMiddleware()
 * 
 * Attaches to req:
 * - req.userId (string) - Clerk user ID
 * - req.user (object) - User context: { id, email, orgId, clerkId }
 */
export const authenticate = async (req, res, next) => {
  try {
    // Get auth state from request (set by clerkMiddleware)
    const auth = getAuth(req);

    // Log auth state for debugging (only in development)
    if (config.env === 'development') {
      logger.debug({ 
        hasAuth: !!auth, 
        userId: auth?.userId,
        sessionId: auth?.sessionId,
        url: req.url,
        authHeader: req.headers.authorization ? 'present' : 'missing'
      }, 'Auth state check');
    }

    // Check if user is authenticated
    if (!auth || !auth.userId) {
      logger.warn({ 
        url: req.url,
        hasAuth: !!auth,
        authHeader: req.headers.authorization ? 'present' : 'missing'
      }, 'No userId found - user not authenticated');
      throw new UnauthorizedError('Authentication required');
    }

    // Clerk user IDs are STRINGS
    const userId = auth.userId; // This is a string
    
    // Attach user context to request
    req.userId = userId;
    req.user = {
      id: userId, // String, not integer
      email: null, // Will be fetched from DB if needed
      orgId: auth.orgId || null, // Organization ID from Clerk (if any)
      clerkId: userId, // Alias for clarity
      sessionId: auth.sessionId || null
    };

    logger.debug({ userId, orgId: auth.orgId }, 'User authenticated');

    next();
  } catch (error) {
    logger.warn({ 
      error: error.message,
      errorStack: error.stack,
      url: req.url,
      ip: req.ip,
      authHeader: req.headers.authorization ? 'present' : 'missing'
    }, 'Authentication failed');
    
    if (error instanceof UnauthorizedError) {
      return next(error);
    }
    
    next(new UnauthorizedError('Authentication failed'));
  }
};

/**
 * Authentication middleware that also fetches full user info from Clerk
 * Use this when you need complete user details (name, email, etc.)
 * Note: This makes an additional API call to Clerk, so use sparingly
 */
export const authenticateWithUserInfo = async (req, res, next) => {
  try {
    // First authenticate (sets req.userId and req.user)
    await authenticate(req, res, async () => {
      try {
        // Fetch full user info from Clerk (cached)
        const userInfo = await clerkService.getUserInfo(req.userId);

        // Enhance req.user with full user info
        req.user = {
          ...req.user,
          email: userInfo.email || req.user.email,
          firstName: userInfo.firstName,
          lastName: userInfo.lastName,
          imageUrl: userInfo.imageUrl,
          createdAt: userInfo.createdAt
        };

        logger.debug({ userId: req.userId }, 'User info fetched and attached');

        next();
      } catch (error) {
        logger.warn({ error, userId: req.userId }, 'Failed to fetch user info');
        // Continue with basic auth even if user info fetch fails
        next();
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Optional authentication middleware
 * Attempts to set user context but doesn't fail if not authenticated
 * Useful for routes that work with or without auth
 */
export const optionalAuth = (req, res, next) => {
  try {
    const auth = getAuth(req);

    if (auth.userId) {
      req.userId = auth.userId;
      req.user = {
        id: auth.userId,
        email: null,
        orgId: auth.orgId || null,
        clerkId: auth.userId,
        sessionId: auth.sessionId || null
      };
    }
  } catch {
    // Silently ignore - optional auth
  }

  next();
};

export default authenticate;

