import asyncHandler from '../utilities/async-handler.js';
import { NotFoundError, ValidationError, ForbiddenError } from '../utilities/errors.js';
import userPlansService from '../services/user-plans.service.js';
import usersService from '../services/users.service.js';
import organizationsService from '../services/organizations.service.js';
import logger from '../utilities/logger.js';

/**
 * POST /api/admin/users/:userId/plan
 * Assign plan to user
 */
export const assignPlanToUser = asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  const { planId, organizationId } = req.body;
  const currentUserId = req.userId; // Clerk ID

  if (isNaN(userId)) {
    throw new ValidationError('Invalid user ID');
  }

  if (!planId || !organizationId) {
    throw new ValidationError('Plan ID and Organization ID are required');
  }

  // Authorization check: user must be admin in the organization
  const currentUser = await usersService.getUserByClerkId(currentUserId);
  if (!currentUser) {
    throw new NotFoundError('Current user not found. Please sync your account first.');
  }
  const belongsToOrg = await organizationsService.userBelongsToOrganization(currentUser.id, organizationId);
  if (!belongsToOrg) {
    throw new ForbiddenError('You do not have access to this organization');
  }
  // TODO: Add actual admin check here (Feature 11.1)

  const assignment = await userPlansService.assignPlanToUser(userId, planId, organizationId);

  logger.info({ userId, planId, organizationId, assignedBy: currentUser.id }, 'Plan assigned to user');

  res.status(201).json({
    success: true,
    data: assignment
  });
});

/**
 * GET /api/users/:userId/plan
 * Get user's plan in organization
 */
export const getUserPlan = asyncHandler(async (req, res) => {
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
      throw new ForbiddenError('You do not have access to this user\'s plan');
    }
    // TODO: Add actual admin check here (Feature 11.1)
  }

  const plan = await userPlansService.getUserPlan(userId, organizationId);

  if (!plan) {
    return res.json({
      success: true,
      data: null,
      message: 'User does not have a plan assigned'
    });
  }

  res.json({
    success: true,
    data: plan
  });
});

/**
 * DELETE /api/admin/users/:userId/plan
 * Remove plan from user
 */
export const removePlanFromUser = asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  const organizationId = parseInt(req.query.organizationId, 10);
  const currentUserId = req.userId; // Clerk ID

  if (isNaN(userId)) {
    throw new ValidationError('Invalid user ID');
  }

  if (isNaN(organizationId)) {
    throw new ValidationError('Organization ID is required');
  }

  // Authorization check: user must be admin in the organization
  const currentUser = await usersService.getUserByClerkId(currentUserId);
  if (!currentUser) {
    throw new NotFoundError('Current user not found. Please sync your account first.');
  }
  const belongsToOrg = await organizationsService.userBelongsToOrganization(currentUser.id, organizationId);
  if (!belongsToOrg) {
    throw new ForbiddenError('You do not have access to this organization');
  }
  // TODO: Add actual admin check here (Feature 11.1)

  await userPlansService.removePlanFromUser(userId, organizationId);

  logger.info({ userId, organizationId, removedBy: currentUser.id }, 'Plan removed from user');

  res.status(204).send();
});

