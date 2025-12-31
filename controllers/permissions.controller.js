import asyncHandler from '../utilities/async-handler.js';
import { NotFoundError, ValidationError, ForbiddenError } from '../utilities/errors.js';
import permissionResolutionService from '../services/permission-resolution.service.js';
import usersService from '../services/users.service.js';
import organizationsService from '../services/organizations.service.js';
import logger from '../utilities/logger.js';

/**
 * GET /api/users/:userId/permissions
 * Get resolved permissions for user in organization
 */
export const getUserPermissions = asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  const organizationId = parseInt(req.query.organizationId, 10);
  const currentUserId = req.userId; // Clerk ID

  if (isNaN(userId)) {
    throw new ValidationError('Invalid user ID');
  }

  if (isNaN(organizationId)) {
    throw new ValidationError('Organization ID is required');
  }

  // Authorization check: admin or self
  const currentUser = await usersService.getUserByClerkId(currentUserId);
  if (!currentUser) {
    throw new NotFoundError('Current user not found. Please sync your account first.');
  }
  if (currentUser.id !== userId) {
    const belongsToOrg = await organizationsService.userBelongsToOrganization(currentUser.id, organizationId);
    if (!belongsToOrg) {
      throw new ForbiddenError('You do not have access to this user\'s permissions');
    }
    // TODO: Add actual admin check here (Feature 11.1)
  }

  const permissions = await permissionResolutionService.resolvePermissions(userId, organizationId);

  logger.debug({ userId, organizationId }, 'User permissions retrieved');

  res.json({
    success: true,
    data: permissions
  });
});

/**
 * GET /api/me/permissions
 * Get resolved permissions for current user
 */
export const getCurrentUserPermissions = asyncHandler(async (req, res) => {
  const currentUserId = req.userId; // Clerk ID
  const organizationId = parseInt(req.query.organizationId, 10);

  if (isNaN(organizationId)) {
    throw new ValidationError('Organization ID is required');
  }

  // Get current user from database
  const currentUser = await usersService.getUserByClerkId(currentUserId);
  if (!currentUser) {
    throw new NotFoundError('Current user not found. Please sync your account first.');
  }

  // Verify user belongs to organization
  const belongsToOrg = await organizationsService.userBelongsToOrganization(currentUser.id, organizationId);
  if (!belongsToOrg) {
    throw new ForbiddenError('You do not belong to this organization');
  }

  const permissions = await permissionResolutionService.resolvePermissions(currentUser.id, organizationId);

  logger.debug({ userId: currentUser.id, organizationId }, 'Current user permissions retrieved');

  res.json({
    success: true,
    data: permissions
  });
});
