import asyncHandler from '../utilities/async-handler.js';
import usersService from '../services/users.service.js';
import { NotFoundError, ValidationError, ForbiddenError } from '../utilities/errors.js';
import { validateEmail, validateClerkId } from '../utilities/validators.js';
import logger from '../utilities/logger.js';

/**
 * POST /api/users/sync
 * Sync user from Clerk (webhook or initial sync)
 * Creates or updates user in database
 */
export const syncUser = asyncHandler(async (req, res) => {
  const { clerkId, email, organizationId } = req.body;

  // Validate inputs
  const clerkIdError = validateClerkId(clerkId);
  if (clerkIdError) {
    throw new ValidationError(clerkIdError);
  }

  const emailError = validateEmail(email);
  if (emailError) {
    throw new ValidationError(emailError);
  }

  // Check if user already exists
  const existingUser = await usersService.getUserByClerkId(clerkId);
  const isNew = !existingUser;

  // Create or update user
  const user = await usersService.createOrUpdateUser(clerkId, email, organizationId);

  logger.info({ 
    userId: user.id, 
    clerkId, 
    isNew 
  }, isNew ? 'User synced (created)' : 'User synced (updated)');

  res.status(isNew ? 201 : 200).json({
    success: true,
    data: user
  });
});

/**
 * GET /api/users/me
 * Get current authenticated user
 * Uses req.user from auth middleware
 */
export const getCurrentUser = asyncHandler(async (req, res) => {
  const clerkId = req.userId; // From auth middleware

  if (!clerkId) {
    throw new ValidationError('User ID not found in request');
  }

  // Get user from database
  const user = await usersService.getUserByClerkId(clerkId);

  if (!user) {
    // User doesn't exist in database - sync them
    logger.info({ clerkId }, 'User not found in database, syncing...');
    
    // Get email from Clerk user info if available
    const email = req.user?.email || null;
    
    if (!email) {
      throw new NotFoundError('User not found. Please sync your account first.');
    }

    // Sync user
    const syncedUser = await usersService.createOrUpdateUser(clerkId, email, null);
    
    // Get with organization
    const userWithOrg = await usersService.getUserWithOrganization(syncedUser.id);
    
    return res.json({
      success: true,
      data: userWithOrg
    });
  }

  // Get user with organization
  const userWithOrg = await usersService.getUserWithOrganization(user.id);

  res.json({
    success: true,
    data: userWithOrg
  });
});

/**
 * GET /api/users/:userId
 * Get specific user by database ID
 */
export const getUserById = asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.userId, 10);

  if (isNaN(userId)) {
    throw new ValidationError('Invalid user ID');
  }

  const user = await usersService.getUserById(userId);

  if (!user) {
    throw new NotFoundError('User not found');
  }

  res.json({
    success: true,
    data: user
  });
});

/**
 * GET /api/organizations/:orgId/users
 * List users in organization with pagination
 */
export const getUsersByOrganization = asyncHandler(async (req, res) => {
  const orgId = parseInt(req.params.orgId, 10);
  const limit = parseInt(req.query.limit || '50', 10);
  const offset = parseInt(req.query.offset || '0', 10);
  const currentUserId = req.userId; // Clerk ID

  if (isNaN(orgId)) {
    throw new ValidationError('Invalid organization ID');
  }

  // Get current user
  const currentUser = await usersService.getUserByClerkId(currentUserId);
  if (!currentUser) {
    throw new NotFoundError('Current user not found');
  }

  // Check authorization: user must be in organization
  const organizationsService = (await import('../services/organizations.service.js')).default;
  const belongsToOrg = await organizationsService.userBelongsToOrganization(currentUser.id, orgId);
  if (!belongsToOrg) {
    throw new ForbiddenError('You do not have access to this organization');
  }

  const result = await usersService.getUsersByOrganization(orgId, limit, offset);

  res.json({
    success: true,
    data: result.users,
    pagination: {
      total: result.total,
      limit,
      offset,
      hasMore: result.hasMore
    }
  });
});

/**
 * PUT /api/users/:userId
 * Update user details
 * Users can only update themselves (unless admin)
 */
export const updateUser = asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  const updates = req.body;
  const currentUserId = req.userId; // Clerk ID from auth middleware

  if (isNaN(userId)) {
    throw new ValidationError('Invalid user ID');
  }

  // Get current user to check authorization
  const currentUser = await usersService.getUserByClerkId(currentUserId);
  
  if (!currentUser) {
    throw new NotFoundError('Current user not found');
  }

  // Check authorization: user can only update themselves
  // TODO: Allow admins to update any user (will be implemented with admin check)
  if (currentUser.id !== userId) {
    throw new ForbiddenError('You can only update your own profile');
  }

  // Validate email if provided
  if (updates.email) {
    const emailError = validateEmail(updates.email);
    if (emailError) {
      throw new ValidationError(emailError);
    }
  }

  const updatedUser = await usersService.updateUser(userId, updates);

  logger.info({ userId, updatedBy: currentUserId }, 'User updated');

  res.json({
    success: true,
    data: updatedUser
  });
});

/**
 * DELETE /api/users/:userId
 * Delete user (admin only)
 */
export const deleteUser = asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  const currentUserId = req.userId; // Clerk ID from auth middleware

  if (isNaN(userId)) {
    throw new ValidationError('Invalid user ID');
  }

  // TODO: Check authorization - admin only
  // For now, allow users to delete themselves
  const currentUser = await usersService.getUserByClerkId(currentUserId);
  
  if (!currentUser) {
    throw new NotFoundError('Current user not found');
  }

  // Allow self-deletion or admin (will be enhanced with admin check)
  if (currentUser.id !== userId) {
    throw new ForbiddenError('You can only delete your own account');
  }

  await usersService.deleteUser(userId);

  logger.info({ userId, deletedBy: currentUserId }, 'User deleted');

  res.status(204).send();
});
