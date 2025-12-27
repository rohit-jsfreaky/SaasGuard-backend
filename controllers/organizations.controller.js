import asyncHandler from '../utilities/async-handler.js';
import organizationsService from '../services/organizations.service.js';
import usersService from '../services/users.service.js';
import { NotFoundError, ValidationError, ForbiddenError, ConflictError } from '../utilities/errors.js';
import logger from '../utilities/logger.js';

/**
 * POST /api/organizations
 * Create new organization
 */
export const createOrganization = asyncHandler(async (req, res) => {
  const { name } = req.body;
  const currentUserId = req.userId; // Clerk ID from auth middleware

  if (!name || name.trim().length === 0) {
    throw new ValidationError('Organization name is required');
  }

  // Get current user from database
  const currentUser = await usersService.getUserByClerkId(currentUserId);
  if (!currentUser) {
    throw new NotFoundError('Current user not found. Please sync your account first.');
  }

  // Create organization
  const org = await organizationsService.createOrganization(name.trim(), currentUser.id);

  logger.info({ orgId: org.id, name, createdBy: currentUser.id }, 'Organization created');

  res.status(201).json({
    success: true,
    data: org
  });
});

/**
 * GET /api/organizations/:orgId
 * Get organization by ID
 */
export const getOrganization = asyncHandler(async (req, res) => {
  const orgId = parseInt(req.params.orgId, 10);
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
  const belongsToOrg = await organizationsService.userBelongsToOrganization(currentUser.id, orgId);
  if (!belongsToOrg) {
    throw new ForbiddenError('You do not have access to this organization');
  }

  const org = await organizationsService.getOrganization(orgId);

  if (!org) {
    throw new NotFoundError('Organization not found');
  }

  res.json({
    success: true,
    data: org
  });
});

/**
 * GET /api/organizations
 * List user's organizations
 */
export const getUserOrganizations = asyncHandler(async (req, res) => {
  const currentUserId = req.userId; // Clerk ID

  // Get current user from database
  const currentUser = await usersService.getUserByClerkId(currentUserId);
  if (!currentUser) {
    throw new NotFoundError('Current user not found. Please sync your account first.');
  }

  // Get all organizations user belongs to
  const orgs = await organizationsService.getUserOrganizations(currentUser.id);

  res.json({
    success: true,
    data: orgs
  });
});

/**
 * PUT /api/organizations/:orgId
 * Update organization
 */
export const updateOrganization = asyncHandler(async (req, res) => {
  const orgId = parseInt(req.params.orgId, 10);
  const updates = req.body;
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
  const belongsToOrg = await organizationsService.userBelongsToOrganization(currentUser.id, orgId);
  if (!belongsToOrg) {
    throw new ForbiddenError('You do not have access to this organization');
  }

  // TODO: Check if user is admin - for now, allow any member to update
  // This will be enhanced when admin roles are implemented

  const updatedOrg = await organizationsService.updateOrganization(orgId, updates);

  logger.info({ orgId, updatedBy: currentUser.id }, 'Organization updated');

  res.json({
    success: true,
    data: updatedOrg
  });
});

/**
 * DELETE /api/organizations/:orgId
 * Delete organization
 */
export const deleteOrganization = asyncHandler(async (req, res) => {
  const orgId = parseInt(req.params.orgId, 10);
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
  const belongsToOrg = await organizationsService.userBelongsToOrganization(currentUser.id, orgId);
  if (!belongsToOrg) {
    throw new ForbiddenError('You do not have access to this organization');
  }

  // TODO: Check if user is admin - for now, check if user is creator
  const org = await organizationsService.getOrganization(orgId);
  if (!org) {
    throw new NotFoundError('Organization not found');
  }

  if (org.createdBy !== currentUser.id) {
    throw new ForbiddenError('Only the organization creator can delete the organization');
  }

  await organizationsService.deleteOrganization(orgId);

  logger.info({ orgId, deletedBy: currentUser.id }, 'Organization deleted');

  res.status(204).send();
});

/**
 * GET /api/organizations/:orgId/members
 * List organization members with pagination
 */
export const getOrganizationMembers = asyncHandler(async (req, res) => {
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
  const belongsToOrg = await organizationsService.userBelongsToOrganization(currentUser.id, orgId);
  if (!belongsToOrg) {
    throw new ForbiddenError('You do not have access to this organization');
  }

  const result = await organizationsService.getOrganizationUsers(orgId, limit, offset);

  res.json({
    success: true,
    data: result.users,
    pagination: {
      total: result.total,
      limit,
      offset,
      hasMore: offset + limit < result.total
    }
  });
});

/**
 * POST /api/organizations/:orgId/members/:userId
 * Add user to organization
 */
export const addMemberToOrganization = asyncHandler(async (req, res) => {
  const orgId = parseInt(req.params.orgId, 10);
  const userId = parseInt(req.params.userId, 10);
  const currentUserId = req.userId; // Clerk ID

  if (isNaN(orgId) || isNaN(userId)) {
    throw new ValidationError('Invalid organization ID or user ID');
  }

  // Get current user
  const currentUser = await usersService.getUserByClerkId(currentUserId);
  if (!currentUser) {
    throw new NotFoundError('Current user not found');
  }

  // Check authorization: user must be in organization
  const belongsToOrg = await organizationsService.userBelongsToOrganization(currentUser.id, orgId);
  if (!belongsToOrg) {
    throw new ForbiddenError('You do not have access to this organization');
  }

  // TODO: Check if user is admin - for now, allow any member to add users
  // This will be enhanced when admin roles are implemented

  await organizationsService.addUserToOrganization(userId, orgId);

  logger.info({ orgId, userId, addedBy: currentUser.id }, 'User added to organization');

  res.status(201).json({
    success: true,
    message: 'User added to organization'
  });
});

/**
 * DELETE /api/organizations/:orgId/members/:userId
 * Remove user from organization
 */
export const removeMemberFromOrganization = asyncHandler(async (req, res) => {
  const orgId = parseInt(req.params.orgId, 10);
  const userId = parseInt(req.params.userId, 10);
  const currentUserId = req.userId; // Clerk ID

  if (isNaN(orgId) || isNaN(userId)) {
    throw new ValidationError('Invalid organization ID or user ID');
  }

  // Get current user
  const currentUser = await usersService.getUserByClerkId(currentUserId);
  if (!currentUser) {
    throw new NotFoundError('Current user not found');
  }

  // Check authorization: user must be in organization
  const belongsToOrg = await organizationsService.userBelongsToOrganization(currentUser.id, orgId);
  if (!belongsToOrg) {
    throw new ForbiddenError('You do not have access to this organization');
  }

  // TODO: Check if user is admin - for now, allow any member to remove users
  // TODO: Check if user has critical roles before removal
  // This will be enhanced when roles are implemented

  // Prevent removing yourself
  if (userId === currentUser.id) {
    throw new ValidationError('You cannot remove yourself from the organization');
  }

  await organizationsService.removeUserFromOrganization(userId, orgId);

  logger.info({ orgId, userId, removedBy: currentUser.id }, 'User removed from organization');

  res.status(204).send();
});
