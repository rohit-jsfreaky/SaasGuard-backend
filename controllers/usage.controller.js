import asyncHandler from '../utilities/async-handler.js';
import { NotFoundError, ValidationError, ForbiddenError } from '../utilities/errors.js';
import usageService from '../services/usage.service.js';
import usersService from '../services/users.service.js';
import organizationsService from '../services/organizations.service.js';
import logger from '../utilities/logger.js';
import cacheService from '../services/cache.service.js';
import cacheKeys from '../utilities/cache-keys.js';

/**
 * POST /api/admin/users/:userId/usage/:featureSlug
 * Record usage for user
 */
export const recordUsage = asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  const featureSlug = req.params.featureSlug;
  const { amount = 1 } = req.body;
  const currentUserId = req.userId; // Clerk ID

  if (isNaN(userId)) {
    throw new ValidationError('Invalid user ID');
  }

  if (!featureSlug) {
    throw new ValidationError('Feature slug is required');
  }

  // Authorization check: admin or self
  const currentUser = await usersService.getUserByClerkId(currentUserId);
  if (!currentUser) {
    throw new NotFoundError('Current user not found. Please sync your account first.');
  }
  if (currentUser.id !== userId) {
    // If not self, check if admin
    // TODO: Add actual admin check here (Feature 11.1)
    // For now, allow if user belongs to same org
    const targetUser = await usersService.getUserById(userId);
    if (!targetUser || !targetUser.organizationId) {
      throw new NotFoundError('Target user or their organization not found');
    }
    const belongsToOrg = await organizationsService.userBelongsToOrganization(
      currentUser.id,
      targetUser.organizationId
    );
    if (!belongsToOrg) {
      throw new ForbiddenError('You do not have permission to record usage for this user');
    }
  }

  const usage = await usageService.recordUsage(userId, featureSlug, amount);

  // Invalidate permission cache
  if (currentUser.organizationId) {
    await cacheService.del(cacheKeys.userPermissions(String(userId), currentUser.organizationId));
  }

  logger.info({ userId, featureSlug, amount, recordedBy: currentUser.id }, 'Usage recorded');

  res.status(201).json({
    success: true,
    data: usage
  });
});

/**
 * GET /api/admin/users/:userId/usage
 * List all usage records for user
 */
export const getUserUsage = asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  const currentUserId = req.userId; // Clerk ID

  if (isNaN(userId)) {
    throw new ValidationError('Invalid user ID');
  }

  // Authorization check: admin or self
  const currentUser = await usersService.getUserByClerkId(currentUserId);
  if (!currentUser) {
    throw new NotFoundError('Current user not found. Please sync your account first.');
  }
  if (currentUser.id !== userId) {
    // If not self, check if admin
    const targetUser = await usersService.getUserById(userId);
    if (!targetUser || !targetUser.organizationId) {
      throw new NotFoundError('Target user or their organization not found');
    }
    const belongsToOrg = await organizationsService.userBelongsToOrganization(
      currentUser.id,
      targetUser.organizationId
    );
    if (!belongsToOrg) {
      throw new ForbiddenError('You do not have access to this user\'s usage');
    }
    // TODO: Add actual admin check here (Feature 11.1)
  }

  const usageRecords = await usageService.getUserUsage(userId);

  res.json({
    success: true,
    data: usageRecords
  });
});

/**
 * GET /api/admin/users/:userId/usage/:featureSlug
 * Get specific usage for user and feature
 */
export const getUsage = asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  const featureSlug = req.params.featureSlug;
  const currentUserId = req.userId; // Clerk ID

  if (isNaN(userId)) {
    throw new ValidationError('Invalid user ID');
  }

  if (!featureSlug) {
    throw new ValidationError('Feature slug is required');
  }

  // Authorization check: admin or self
  const currentUser = await usersService.getUserByClerkId(currentUserId);
  if (!currentUser) {
    throw new NotFoundError('Current user not found. Please sync your account first.');
  }
  if (currentUser.id !== userId) {
    const targetUser = await usersService.getUserById(userId);
    if (!targetUser || !targetUser.organizationId) {
      throw new NotFoundError('Target user or their organization not found');
    }
    const belongsToOrg = await organizationsService.userBelongsToOrganization(
      currentUser.id,
      targetUser.organizationId
    );
    if (!belongsToOrg) {
      throw new ForbiddenError('You do not have access to this user\'s usage');
    }
    // TODO: Add actual admin check here (Feature 11.1)
  }

  const usageCount = await usageService.getUsage(userId, featureSlug);

  res.json({
    success: true,
    data: {
      userId,
      featureSlug,
      currentUsage: usageCount
    }
  });
});

/**
 * POST /api/admin/users/:userId/usage/:featureSlug/reset
 * Reset usage for specific feature
 */
export const resetUsage = asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  const featureSlug = req.params.featureSlug;
  const currentUserId = req.userId; // Clerk ID

  if (isNaN(userId)) {
    throw new ValidationError('Invalid user ID');
  }

  if (!featureSlug) {
    throw new ValidationError('Feature slug is required');
  }

  // Authorization check: admin only
  const currentUser = await usersService.getUserByClerkId(currentUserId);
  if (!currentUser) {
    throw new NotFoundError('Current user not found. Please sync your account first.');
  }
  // TODO: Add actual admin check here (Feature 11.1)

  await usageService.resetUsage(userId, featureSlug);

  // Invalidate permission cache
  const targetUser = await usersService.getUserById(userId);
  if (targetUser && targetUser.organizationId) {
    await cacheService.del(cacheKeys.userPermissions(String(userId), targetUser.organizationId));
  }

  logger.info({ userId, featureSlug, resetBy: currentUser.id }, 'Usage reset');

  res.json({
    success: true,
    message: 'Usage reset successfully'
  });
});

/**
 * POST /api/admin/usage/reset-all
 * Reset all usage counters for all users (monthly reset)
 */
export const resetAllUsage = asyncHandler(async (req, res) => {
  const currentUserId = req.userId; // Clerk ID

  // Authorization check: admin only
  const currentUser = await usersService.getUserByClerkId(currentUserId);
  if (!currentUser) {
    throw new NotFoundError('Current user not found. Please sync your account first.');
  }
  // TODO: Add actual admin check here (Feature 11.1)

  // This is a bulk operation - we'll reset all users
  // In production, you might want to do this in batches
  const { db } = await import('../config/db.js');
  const { usage } = await import('../models/usage.model.js');
  const { sql } = await import('drizzle-orm');

  const result = await db
    .update(usage)
    .set({
      currentUsage: 0,
      updatedAt: new Date()
    })
    .returning();

  // Clear all usage caches
  await cacheService.clear(); // Or selectively clear usage caches

  logger.info({ resetBy: currentUser.id, count: result.length }, 'All usage reset');

  res.json({
    success: true,
    message: `Reset usage for ${result.length} feature-user combinations`,
    data: {
      resetCount: result.length
    }
  });
});

/**
 * GET /api/admin/features/:featureSlug/usage
 * Get usage statistics for a feature across all users
 */
export const getFeatureUsageStats = asyncHandler(async (req, res) => {
  const featureSlug = req.params.featureSlug;
  const currentUserId = req.userId; // Clerk ID

  if (!featureSlug) {
    throw new ValidationError('Feature slug is required');
  }

  // Authorization check: admin only
  const currentUser = await usersService.getUserByClerkId(currentUserId);
  if (!currentUser) {
    throw new NotFoundError('Current user not found. Please sync your account first.');
  }
  // TODO: Add actual admin check here (Feature 11.1)

  const stats = await usageService.getUsageByFeature(featureSlug);

  res.json({
    success: true,
    data: stats
  });
});
