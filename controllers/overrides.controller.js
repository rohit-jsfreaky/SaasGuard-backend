import asyncHandler from '../utilities/async-handler.js';
import { NotFoundError, ValidationError, ForbiddenError } from '../utilities/errors.js';
import overridesService from '../services/overrides.service.js';
import usersService from '../services/users.service.js';
import organizationsService from '../services/organizations.service.js';
import logger from '../utilities/logger.js';
import { validateOverrideType, validateOverrideValue, validateExpirationDate } from '../utilities/validators.js';

/**
 * POST /api/admin/overrides
 * Create user-level override
 */
export const createUserOverride = asyncHandler(async (req, res) => {
  const { userId, featureSlug, overrideType, value, expiresAt, reason } = req.body;
  const currentUserId = req.userId; // Clerk ID

  if (!userId) {
    throw new ValidationError('User ID is required');
  }

  // Get current user from database
  const currentUser = await usersService.getUserByClerkId(currentUserId);
  if (!currentUser) {
    throw new NotFoundError('Current user not found. Please sync your account first.');
  }

  // Get target user
  const targetUser = await usersService.getUserById(userId);
  if (!targetUser) {
    throw new NotFoundError('Target user not found');
  }

  // Verify current user belongs to same organization as target user
  // TODO: Add proper admin check - for now, check if user belongs to org
  if (targetUser.organizationId) {
    const belongsToOrg = await organizationsService.userBelongsToOrganization(currentUser.id, targetUser.organizationId);
    if (!belongsToOrg) {
      throw new ForbiddenError('You do not have access to create overrides for this user');
    }
  }

  // Validate inputs
  const typeError = validateOverrideType(overrideType);
  if (typeError) {
    throw new ValidationError(typeError);
  }

  if (value !== undefined && value !== null) {
    const valueError = validateOverrideValue(overrideType, value);
    if (valueError) {
      throw new ValidationError(valueError);
    }
  }

  if (expiresAt) {
    const dateError = validateExpirationDate(expiresAt);
    if (dateError) {
      throw new ValidationError(dateError);
    }
  }

  // Create override
  const override = await overridesService.createUserOverride(
    userId,
    featureSlug,
    overrideType,
    value,
    expiresAt ? new Date(expiresAt) : null,
    reason,
    currentUser.id
  );

  res.status(201).json({
    success: true,
    data: override
  });
});

/**
 * GET /api/admin/users/:userId/overrides
 * List all active overrides for user
 */
export const getUserOverrides = asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  const currentUserId = req.userId; // Clerk ID

  if (isNaN(userId)) {
    throw new ValidationError('Invalid user ID');
  }

  // Get current user
  const currentUser = await usersService.getUserByClerkId(currentUserId);
  if (!currentUser) {
    throw new NotFoundError('Current user not found. Please sync your account first.');
  }

  // Check authorization: admin or self
  const isSelf = currentUser.id === userId;
  if (!isSelf) {
    // TODO: Check if current user is admin
    // For now, allow if user belongs to same org
    const targetUser = await usersService.getUserById(userId);
    if (targetUser && targetUser.organizationId) {
      const belongsToOrg = await organizationsService.userBelongsToOrganization(currentUser.id, targetUser.organizationId);
      if (!belongsToOrg) {
        throw new ForbiddenError('You do not have access to view overrides for this user');
      }
    }
  }

  // Get user overrides
  const overrides = await overridesService.getUserActiveOverrides(userId);

  res.json({
    success: true,
    data: overrides
  });
});

/**
 * GET /api/admin/overrides
 * List all overrides with filtering
 */
export const getAllOverrides = asyncHandler(async (req, res) => {
  const featureSlug = req.query.featureSlug;
  const status = req.query.status || 'active'; // 'active', 'expired', 'all'
  const organizationId = req.query.organizationId ? parseInt(req.query.organizationId, 10) : undefined;
  const limit = parseInt(req.query.limit || '50', 10);
  const offset = parseInt(req.query.offset || '0', 10);
  const currentUserId = req.userId; // Clerk ID

  // Get current user
  const currentUser = await usersService.getUserByClerkId(currentUserId);
  if (!currentUser) {
    throw new NotFoundError('Current user not found. Please sync your account first.');
  }

  // If organizationId is provided, verify user belongs to it
  if (organizationId) {
    const belongsToOrg = await organizationsService.userBelongsToOrganization(currentUser.id, organizationId);
    if (!belongsToOrg) {
      throw new ForbiddenError('You do not have access to this organization');
    }
  }

  // Get overrides
  const result = await overridesService.getAllOverrides({
    featureSlug,
    status,
    organizationId,
    limit,
    offset
  });

  res.json({
    success: true,
    data: result.overrides,
    pagination: {
      total: result.total,
      limit: result.limit,
      offset: result.offset,
      hasMore: result.hasMore
    }
  });
});

/**
 * GET /api/admin/overrides/:overrideId
 * Get override by ID
 */
export const getOverride = asyncHandler(async (req, res) => {
  const overrideId = parseInt(req.params.overrideId, 10);
  const currentUserId = req.userId; // Clerk ID

  if (isNaN(overrideId)) {
    throw new ValidationError('Invalid override ID');
  }

  // Get override
  const override = await overridesService.getOverrideById(overrideId);
  if (!override) {
    throw new NotFoundError('Override not found');
  }

  // Get current user
  const currentUser = await usersService.getUserByClerkId(currentUserId);
  if (!currentUser) {
    throw new NotFoundError('Current user not found. Please sync your account first.');
  }

  // Verify authorization
  if (override.organizationId) {
    const belongsToOrg = await organizationsService.userBelongsToOrganization(currentUser.id, override.organizationId);
    if (!belongsToOrg) {
      throw new ForbiddenError('You do not have access to this override');
    }
  } else if (override.userId) {
    // Check if current user is the target user or admin
    const isSelf = currentUser.id === override.userId;
    if (!isSelf) {
      const targetUser = await usersService.getUserById(override.userId);
      if (targetUser && targetUser.organizationId) {
        const belongsToOrg = await organizationsService.userBelongsToOrganization(currentUser.id, targetUser.organizationId);
        if (!belongsToOrg) {
          throw new ForbiddenError('You do not have access to this override');
        }
      }
    }
  }

  res.json({
    success: true,
    data: override
  });
});

/**
 * PUT /api/admin/overrides/:overrideId
 * Update override
 */
export const updateOverride = asyncHandler(async (req, res) => {
  const overrideId = parseInt(req.params.overrideId, 10);
  const { value, expiresAt, reason } = req.body;
  const currentUserId = req.userId; // Clerk ID

  if (isNaN(overrideId)) {
    throw new ValidationError('Invalid override ID');
  }

  // Get override
  const override = await overridesService.getOverrideById(overrideId);
  if (!override) {
    throw new NotFoundError('Override not found');
  }

  // Get current user
  const currentUser = await usersService.getUserByClerkId(currentUserId);
  if (!currentUser) {
    throw new NotFoundError('Current user not found. Please sync your account first.');
  }

  // Verify authorization
  if (override.organizationId) {
    const belongsToOrg = await organizationsService.userBelongsToOrganization(currentUser.id, override.organizationId);
    if (!belongsToOrg) {
      throw new ForbiddenError('You do not have access to update this override');
    }
  } else if (override.userId) {
    // Check if current user is admin in the user's org
    const targetUser = await usersService.getUserById(override.userId);
    if (targetUser && targetUser.organizationId) {
      const belongsToOrg = await organizationsService.userBelongsToOrganization(currentUser.id, targetUser.organizationId);
      if (!belongsToOrg) {
        throw new ForbiddenError('You do not have access to update this override');
      }
    }
  }

  // Validate inputs
  if (value !== undefined && value !== null) {
    const valueError = validateOverrideValue(override.overrideType, value);
    if (valueError) {
      throw new ValidationError(valueError);
    }
  }

  if (expiresAt) {
    const dateError = validateExpirationDate(expiresAt);
    if (dateError) {
      throw new ValidationError(dateError);
    }
  }

  // Update override
  const updates = {};
  if (value !== undefined) updates.value = value;
  if (expiresAt !== undefined) updates.expiresAt = expiresAt;
  if (reason !== undefined) updates.reason = reason;

  const updated = await overridesService.updateOverride(overrideId, updates);

  res.json({
    success: true,
    data: updated
  });
});

/**
 * DELETE /api/admin/overrides/:overrideId
 * Delete override
 */
export const deleteOverride = asyncHandler(async (req, res) => {
  const overrideId = parseInt(req.params.overrideId, 10);
  const currentUserId = req.userId; // Clerk ID

  if (isNaN(overrideId)) {
    throw new ValidationError('Invalid override ID');
  }

  // Get override
  const override = await overridesService.getOverrideById(overrideId);
  if (!override) {
    throw new NotFoundError('Override not found');
  }

  // Get current user
  const currentUser = await usersService.getUserByClerkId(currentUserId);
  if (!currentUser) {
    throw new NotFoundError('Current user not found. Please sync your account first.');
  }

  // Verify authorization
  if (override.organizationId) {
    const belongsToOrg = await organizationsService.userBelongsToOrganization(currentUser.id, override.organizationId);
    if (!belongsToOrg) {
      throw new ForbiddenError('You do not have access to delete this override');
    }
  } else if (override.userId) {
    // Check if current user is admin in the user's org
    const targetUser = await usersService.getUserById(override.userId);
    if (targetUser && targetUser.organizationId) {
      const belongsToOrg = await organizationsService.userBelongsToOrganization(currentUser.id, targetUser.organizationId);
      if (!belongsToOrg) {
        throw new ForbiddenError('You do not have access to delete this override');
      }
    }
  }

  // Delete override
  await overridesService.deleteOverride(overrideId);

  res.status(204).send();
});

/**
 * POST /api/admin/organizations/:orgId/overrides
 * Create organization-level override
 */
export const createOrganizationOverride = asyncHandler(async (req, res) => {
  const orgId = parseInt(req.params.orgId, 10);
  const { featureSlug, overrideType, value, expiresAt, reason } = req.body;
  const currentUserId = req.userId; // Clerk ID

  if (isNaN(orgId)) {
    throw new ValidationError('Invalid organization ID');
  }

  // Get current user
  const currentUser = await usersService.getUserByClerkId(currentUserId);
  if (!currentUser) {
    throw new NotFoundError('Current user not found. Please sync your account first.');
  }

  // Verify user belongs to organization
  const belongsToOrg = await organizationsService.userBelongsToOrganization(currentUser.id, orgId);
  if (!belongsToOrg) {
    throw new ForbiddenError('You do not have access to this organization');
  }

  // Validate inputs
  const typeError = validateOverrideType(overrideType);
  if (typeError) {
    throw new ValidationError(typeError);
  }

  if (value !== undefined && value !== null) {
    const valueError = validateOverrideValue(overrideType, value);
    if (valueError) {
      throw new ValidationError(valueError);
    }
  }

  if (expiresAt) {
    const dateError = validateExpirationDate(expiresAt);
    if (dateError) {
      throw new ValidationError(dateError);
    }
  }

  // Create override
  const override = await overridesService.createOrganizationOverride(
    orgId,
    featureSlug,
    overrideType,
    value,
    expiresAt ? new Date(expiresAt) : null,
    reason,
    currentUser.id
  );

  res.status(201).json({
    success: true,
    data: override
  });
});

/**
 * GET /api/admin/organizations/:orgId/overrides
 * List organization-level overrides
 */
export const getOrganizationOverrides = asyncHandler(async (req, res) => {
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

  // Verify user belongs to organization
  const belongsToOrg = await organizationsService.userBelongsToOrganization(currentUser.id, orgId);
  if (!belongsToOrg) {
    throw new ForbiddenError('You do not have access to this organization');
  }

  // Get organization overrides
  const orgOverrides = await overridesService.getOrganizationActiveOverrides(orgId);

  res.json({
    success: true,
    data: orgOverrides
  });
});

/**
 * PUT /api/admin/organizations/:orgId/overrides/:overrideId
 * Update organization override
 */
export const updateOrganizationOverride = asyncHandler(async (req, res) => {
  const orgId = parseInt(req.params.orgId, 10);
  const overrideId = parseInt(req.params.overrideId, 10);
  const { value, expiresAt, reason } = req.body;
  const currentUserId = req.userId; // Clerk ID

  if (isNaN(orgId) || isNaN(overrideId)) {
    throw new ValidationError('Invalid organization ID or override ID');
  }

  // Get override
  const override = await overridesService.getOverrideById(overrideId);
  if (!override) {
    throw new NotFoundError('Override not found');
  }

  // Verify override belongs to organization
  if (override.organizationId !== orgId) {
    throw new ValidationError('Override does not belong to this organization');
  }

  // Get current user
  const currentUser = await usersService.getUserByClerkId(currentUserId);
  if (!currentUser) {
    throw new NotFoundError('Current user not found. Please sync your account first.');
  }

  // Verify user belongs to organization
  const belongsToOrg = await organizationsService.userBelongsToOrganization(currentUser.id, orgId);
  if (!belongsToOrg) {
    throw new ForbiddenError('You do not have access to this organization');
  }

  // Validate inputs
  if (value !== undefined && value !== null) {
    const valueError = validateOverrideValue(override.overrideType, value);
    if (valueError) {
      throw new ValidationError(valueError);
    }
  }

  if (expiresAt) {
    const dateError = validateExpirationDate(expiresAt);
    if (dateError) {
      throw new ValidationError(dateError);
    }
  }

  // Update override
  const updates = {};
  if (value !== undefined) updates.value = value;
  if (expiresAt !== undefined) updates.expiresAt = expiresAt;
  if (reason !== undefined) updates.reason = reason;

  const updated = await overridesService.updateOverride(overrideId, updates);

  res.json({
    success: true,
    data: updated
  });
});

/**
 * DELETE /api/admin/organizations/:orgId/overrides/:overrideId
 * Delete organization override
 */
export const deleteOrganizationOverride = asyncHandler(async (req, res) => {
  const orgId = parseInt(req.params.orgId, 10);
  const overrideId = parseInt(req.params.overrideId, 10);
  const currentUserId = req.userId; // Clerk ID

  if (isNaN(orgId) || isNaN(overrideId)) {
    throw new ValidationError('Invalid organization ID or override ID');
  }

  // Get override
  const override = await overridesService.getOverrideById(overrideId);
  if (!override) {
    throw new NotFoundError('Override not found');
  }

  // Verify override belongs to organization
  if (override.organizationId !== orgId) {
    throw new ValidationError('Override does not belong to this organization');
  }

  // Get current user
  const currentUser = await usersService.getUserByClerkId(currentUserId);
  if (!currentUser) {
    throw new NotFoundError('Current user not found. Please sync your account first.');
  }

  // Verify user belongs to organization
  const belongsToOrg = await organizationsService.userBelongsToOrganization(currentUser.id, orgId);
  if (!belongsToOrg) {
    throw new ForbiddenError('You do not have access to this organization');
  }

  // Delete override
  await overridesService.deleteOverride(overrideId);

  res.status(204).send();
});

/**
 * POST /api/admin/overrides/cleanup-expired
 * Cleanup expired overrides (admin only)
 */
export const cleanupExpiredOverrides = asyncHandler(async (req, res) => {
  const currentUserId = req.userId; // Clerk ID

  // Get current user
  const currentUser = await usersService.getUserByClerkId(currentUserId);
  if (!currentUser) {
    throw new NotFoundError('Current user not found. Please sync your account first.');
  }

  // TODO: Add proper admin check
  // For now, allow any authenticated user (should be restricted to admins)

  // Delete expired overrides
  const deletedCount = await overridesService.deleteExpiredOverrides();

  res.json({
    success: true,
    message: `Deleted ${deletedCount} expired override(s)`,
    data: {
      deletedCount
    }
  });
});
