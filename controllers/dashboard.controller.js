import asyncHandler from '../utilities/async-handler.js';
import { NotFoundError, ValidationError, ForbiddenError } from '../utilities/errors.js';
import dashboardService from '../services/dashboard.service.js';
import usersService from '../services/users.service.js';
import organizationsService from '../services/organizations.service.js';
import logger from '../utilities/logger.js';

/**
 * GET /api/admin/organizations/:orgId/overview
 * Get dashboard overview for organization
 */
export const getDashboardOverview = asyncHandler(async (req, res) => {
  const orgId = parseInt(req.params.orgId, 10);
  const currentUserId = req.userId; // Clerk ID

  if (isNaN(orgId)) {
    throw new ValidationError('Invalid organization ID');
  }

  // Get current user
  const currentUser = await usersService.getUserByClerkId(currentUserId);
  if (!currentUser) {
    throw new NotFoundError('Current user not found. Please sync your account first.');
  }

  // Check authorization: user must be in organization
  const belongsToOrg = await organizationsService.userBelongsToOrganization(currentUser.id, orgId);
  if (!belongsToOrg) {
    throw new ForbiddenError('You do not have access to this organization');
  }

  const overview = await dashboardService.getDashboardOverview(orgId);

  logger.debug({ orgId, userId: currentUser.id }, 'Dashboard overview retrieved');

  res.json({
    success: true,
    data: overview
  });
});

