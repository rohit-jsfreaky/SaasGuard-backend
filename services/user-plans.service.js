import { eq, and } from 'drizzle-orm';
import db from '../config/db.js';
import { userPlans } from '../models/user-plans.model.js';
import { plans } from '../models/plans.model.js';
import logger from '../utilities/logger.js';
import { NotFoundError, ValidationError, ConflictError } from '../utilities/errors.js';
import cacheService from './cache.service.js';
import cacheKeys from '../utilities/cache-keys.js';
import { CACHE_TTL } from '../utilities/cache-keys.js';
import usersService from './users.service.js';
import plansService from './plans.service.js';

/**
 * UserPlansService - Handles user-plan assignments
 * Users have one plan per organization
 */
class UserPlansService {
  /**
   * Assign plan to user in organization
   * Replaces existing plan if user already has one
   * @param {number} userId - User ID (database ID)
   * @param {number} planId - Plan ID
   * @param {number} organizationId - Organization ID
   * @returns {Promise<Object>} User plan assignment object
   */
  async assignPlanToUser(userId, planId, organizationId) {
    if (!userId) {
      throw new ValidationError('User ID is required');
    }

    if (!planId) {
      throw new ValidationError('Plan ID is required');
    }

    if (!organizationId) {
      throw new ValidationError('Organization ID is required');
    }

    // Verify user exists
    const user = await usersService.getUserById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Verify plan exists and belongs to organization
    const plan = await plansService.getPlan(planId);
    if (!plan) {
      throw new NotFoundError('Plan not found');
    }

    if (plan.organizationId !== organizationId) {
      throw new ValidationError('Plan does not belong to this organization');
    }

    try {
      // Check if user already has a plan in this organization
      const [existing] = await db
        .select()
        .from(userPlans)
        .where(
          and(
            eq(userPlans.userId, userId),
            eq(userPlans.organizationId, organizationId)
          )
        )
        .limit(1);

      if (existing) {
        // Update existing plan assignment
        const [updated] = await db
          .update(userPlans)
          .set({
            planId,
            updatedAt: new Date()
          })
          .where(eq(userPlans.id, existing.id))
          .returning();

        // Invalidate caches
        await this._invalidateCaches(userId, organizationId);

        logger.info({ userId, planId, organizationId }, 'User plan updated');

        return this._formatUserPlan(updated, plan);
      } else {
        // Create new plan assignment
        const [newAssignment] = await db
          .insert(userPlans)
          .values({
            userId,
            planId,
            organizationId
          })
          .returning();

        // Invalidate caches
        await this._invalidateCaches(userId, organizationId);

        logger.info({ userId, planId, organizationId }, 'Plan assigned to user');

        return this._formatUserPlan(newAssignment, plan);
      }
    } catch (error) {
      logger.error({ error, userId, planId, organizationId }, 'Failed to assign plan to user');
      throw error;
    }
  }

  /**
   * Get user's plan in organization
   * @param {number} userId - User ID (database ID)
   * @param {number} organizationId - Organization ID
   * @returns {Promise<Object|null>} Plan object with assignment info or null
   */
  async getUserPlan(userId, organizationId) {
    if (!userId || !organizationId) {
      return null;
    }

    const cacheKey = `user:plan:${userId}:${organizationId}`;

    try {
      // Try cache first
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.debug({ userId, organizationId }, 'User plan retrieved from cache');
        return cached;
      }

      const [assignment] = await db
        .select({
          id: userPlans.id,
          userId: userPlans.userId,
          planId: userPlans.planId,
          organizationId: userPlans.organizationId,
          createdAt: userPlans.createdAt,
          updatedAt: userPlans.updatedAt
        })
        .from(userPlans)
        .where(
          and(
            eq(userPlans.userId, userId),
            eq(userPlans.organizationId, organizationId)
          )
        )
        .limit(1);

      if (!assignment) {
        // Cache null result for 5 minutes
        await cacheService.set(cacheKey, null, CACHE_TTL.PERMISSIONS);
        return null;
      }

      // Get plan details
      const plan = await plansService.getPlan(assignment.planId);
      if (!plan) {
        return null;
      }

      const result = {
        ...plan,
        assignedAt: assignment.createdAt,
        updatedAt: assignment.updatedAt
      };

      // Cache for 1 hour
      await cacheService.set(cacheKey, result, CACHE_TTL.PLAN_ROLE_DATA);

      return result;
    } catch (error) {
      logger.error({ error, userId, organizationId }, 'Failed to get user plan');
      return null;
    }
  }

  /**
   * Remove plan from user in organization
   * @param {number} userId - User ID (database ID)
   * @param {number} organizationId - Organization ID
   * @returns {Promise<void>}
   */
  async removePlanFromUser(userId, organizationId) {
    if (!userId || !organizationId) {
      throw new ValidationError('User ID and Organization ID are required');
    }

    try {
      await db
        .delete(userPlans)
        .where(
          and(
            eq(userPlans.userId, userId),
            eq(userPlans.organizationId, organizationId)
          )
        );

      // Invalidate caches
      await this._invalidateCaches(userId, organizationId);

      logger.info({ userId, organizationId }, 'Plan removed from user');
    } catch (error) {
      logger.error({ error, userId, organizationId }, 'Failed to remove plan from user');
      throw error;
    }
  }

  /**
   * Check if user has plan in organization
   * @param {number} userId - User ID (database ID)
   * @param {number} organizationId - Organization ID
   * @returns {Promise<boolean>}
   */
  async userHasPlan(userId, organizationId) {
    if (!userId || !organizationId) {
      return false;
    }

    try {
      const [assignment] = await db
        .select()
        .from(userPlans)
        .where(
          and(
            eq(userPlans.userId, userId),
            eq(userPlans.organizationId, organizationId)
          )
        )
        .limit(1);

      return !!assignment;
    } catch (error) {
      logger.error({ error, userId, organizationId }, 'Failed to check user plan');
      return false;
    }
  }

  /**
   * Invalidate user plan caches
   * @private
   * @param {number} userId - User ID
   * @param {number} organizationId - Organization ID
   */
  async _invalidateCaches(userId, organizationId) {
    await cacheService.del(`user:plan:${userId}:${organizationId}`);
    await cacheService.del(cacheKeys.userPermissions(String(userId), organizationId));
  }

  /**
   * Format user plan object for API response
   * @private
   * @param {Object} assignment - Raw assignment from database
   * @param {Object} plan - Plan object
   * @returns {Object} Formatted user plan object
   */
  _formatUserPlan(assignment, plan) {
    return {
      id: assignment.id,
      userId: assignment.userId,
      planId: assignment.planId,
      organizationId: assignment.organizationId,
      plan: {
        id: plan.id,
        name: plan.name,
        slug: plan.slug,
        description: plan.description,
        organizationId: plan.organizationId
      },
      assignedAt: assignment.createdAt,
      updatedAt: assignment.updatedAt
    };
  }
}

const userPlansService = new UserPlansService();
export default userPlansService;

