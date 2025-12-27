import { ForbiddenError } from '../utilities/errors.js';
import logger from '../utilities/logger.js';

/**
 * Admin check middleware
 * Verifies that the authenticated user has admin privileges
 * Note: This is a placeholder - actual admin check logic will depend on your user/role system
 */
export const requireAdmin = async (req, res, next) => {
  try {
    // TODO: Implement actual admin check logic
    // This should check if the user has admin role in the organization
    
    if (!req.userId) {
      throw new ForbiddenError('Authentication required');
    }

    // Placeholder: For now, we'll need to implement this after user/role system is built
    // const isAdmin = await checkUserIsAdmin(req.userId, req.organizationId);
    // if (!isAdmin) {
    //   throw new ForbiddenError('Admin access required');
    // }

    logger.debug({ userId: req.userId }, 'Admin access granted');
    next();
  } catch (error) {
    logger.warn({ error, userId: req.userId }, 'Admin check failed');
    next(error);
  }
};

export default requireAdmin;

