import { ForbiddenError, ValidationError, NotFoundError } from '../utilities/errors.js';
import logger from '../utilities/logger.js';
import usersService from '../services/users.service.js';
import organizationsService from '../services/organizations.service.js';

/**
 * Organization check middleware
 * Verifies user belongs to the requested organization
 * Attaches organization to req.org
 * 
 * Usage:
 *   router.get('/:orgId/something', authenticate, orgCheck, handler)
 */
export const orgCheck = async (req, res, next) => {
  try {
    const orgId = parseInt(req.params.orgId, 10);
    const currentUserId = req.userId; // Clerk ID from auth middleware

    if (isNaN(orgId)) {
      throw new ValidationError('Invalid organization ID');
    }

    if (!currentUserId) {
      throw new ForbiddenError('Authentication required');
    }

    // Get current user from database
    const currentUser = await usersService.getUserByClerkId(currentUserId);
    if (!currentUser) {
      throw new ForbiddenError('User not found');
    }

    // Check if user belongs to organization
    const belongsToOrg = await organizationsService.userBelongsToOrganization(
      currentUser.id,
      orgId
    );

    if (!belongsToOrg) {
      logger.warn({ userId: currentUser.id, orgId }, 'User attempted to access organization without membership');
      throw new ForbiddenError('You do not have access to this organization');
    }

    // Get organization and attach to request
    const org = await organizationsService.getOrganization(orgId);
    if (!org) {
      throw new NotFoundError('Organization not found');
    }

    req.org = org;
    req.orgId = orgId;

    logger.debug({ userId: currentUser.id, orgId }, 'Organization access granted');

    next();
  } catch (error) {
    logger.warn({ error, url: req.url }, 'Organization check failed');
    next(error);
  }
};

export default orgCheck;

