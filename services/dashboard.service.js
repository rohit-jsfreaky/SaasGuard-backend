import { eq, desc, sql } from "drizzle-orm";
import db from "../config/db.js";
import { users } from "../models/users.model.js";
import { plans } from "../models/plans.model.js";
import { features } from "../models/features.model.js";
import { userPlans } from "../models/user-plans.model.js";
import { overrides } from "../models/overrides.model.js";
import { userRoles } from "../models/user-roles.model.js";
import { roles } from "../models/roles.model.js";
import logger from "../utilities/logger.js";
import { ValidationError } from "../utilities/errors.js";
import cacheService from "./cache.service.js";
import cacheKeys from "../utilities/cache-keys.js";
import { CACHE_TTL } from "../utilities/cache-keys.js";
import organizationsService from "./organizations.service.js";
import plansService from "./plans.service.js";
import featuresService from "./features.service.js";
import overridesService from "./overrides.service.js";
import usageService from "./usage.service.js";

/**
 * DashboardService - Handles dashboard overview data aggregation
 */
class DashboardService {
  /**
   * Get dashboard overview for organization
   * Aggregates metrics, plan distribution, feature usage, and recent activity
   * @param {number} organizationId - Organization ID
   * @returns {Promise<Object>} Dashboard overview data
   */
  async getDashboardOverview(organizationId) {
    if (!organizationId) {
      throw new ValidationError("Organization ID is required");
    }

    // Check cache first
    const cacheKey = `dashboard:overview:${organizationId}`;
    const cached = await cacheService.get(cacheKey);
    if (cached) {
      logger.debug(
        { organizationId },
        "Dashboard overview retrieved from cache"
      );
      return cached;
    }

    try {
      // Get all metrics in parallel
      const [
        totalUsers,
        totalPlans,
        activeFeatures,
        activeOverrides,
        planDistribution,
        topFeaturesByUsage,
        recentActivity,
      ] = await Promise.all([
        this._getTotalUsers(organizationId),
        this._getTotalPlans(organizationId),
        this._getActiveFeaturesCount(organizationId),
        this._getActiveOverridesCount(organizationId),
        this._getPlanDistribution(organizationId),
        this._getTopFeaturesByUsage(organizationId),
        this._getRecentActivity(organizationId),
      ]);

      const overview = {
        metrics: {
          totalUsers,
          totalPlans,
          activeFeatures,
          activeOverrides,
        },
        planDistribution,
        topFeaturesByUsage,
        recentActivity,
      };

      // Cache for 5 minutes
      await cacheService.set(cacheKey, overview, CACHE_TTL.PERMISSIONS);

      return overview;
    } catch (error) {
      logger.error(
        { error, organizationId },
        "Failed to get dashboard overview"
      );
      throw error;
    }
  }

  /**
   * Get total users in organization
   * @private
   * @param {number} organizationId - Organization ID
   * @returns {Promise<number>} Total users count
   */
  async _getTotalUsers(organizationId) {
    try {
      const orgUsers = await organizationsService.getOrganizationUsers(
        organizationId,
        1000,
        0
      );
      return orgUsers.total;
    } catch (error) {
      logger.error({ error, organizationId }, "Failed to get total users");
      return 0;
    }
  }

  /**
   * Get total plans in organization
   * @private
   * @param {number} organizationId - Organization ID
   * @returns {Promise<number>} Total plans count
   */
  async _getTotalPlans(organizationId) {
    try {
      const result = await plansService.getPlansByOrganization(
        organizationId,
        1000,
        0
      );
      return result.total;
    } catch (error) {
      logger.error({ error, organizationId }, "Failed to get total plans");
      return 0;
    }
  }

  /**
   * Get active features count for organization
   * @private
   * @param {number} organizationId - Organization ID
   * @returns {Promise<number>} Active features count
   */
  async _getActiveFeaturesCount(organizationId) {
    try {
      const result = await featuresService.getAllFeatures(
        organizationId,
        1000,
        0
      );
      return result.total;
    } catch (error) {
      logger.error(
        { error, organizationId },
        "Failed to get active features count"
      );
      return 0;
    }
  }

  /**
   * Get active overrides count for organization
   * @private
   * @param {number} organizationId - Organization ID
   * @returns {Promise<number>} Active overrides count
   */
  async _getActiveOverridesCount(organizationId) {
    try {
      // Get organization-level overrides (already filtered for active)
      const orgOverrides =
        await overridesService.getOrganizationActiveOverrides(organizationId);

      // Get user-level overrides for users in this organization
      const orgUsers = await organizationsService.getOrganizationUsers(
        organizationId,
        1000,
        0
      );
      const userIds = orgUsers.users.map((u) => u.id);

      let userOverridesCount = 0;
      if (userIds.length > 0) {
        // Get active user overrides for all users in org
        const userOverridesPromises = userIds.map((userId) =>
          overridesService.getUserActiveOverrides(userId).catch(() => [])
        );
        const userOverridesArrays = await Promise.all(userOverridesPromises);
        userOverridesCount = userOverridesArrays.reduce(
          (sum, arr) => sum + arr.length,
          0
        );
      }

      return orgOverrides.length + userOverridesCount;
    } catch (error) {
      logger.error(
        { error, organizationId },
        "Failed to get active overrides count"
      );
      return 0;
    }
  }

  /**
   * Get plan distribution (users per plan)
   * @private
   * @param {number} organizationId - Organization ID
   * @returns {Promise<Array>} Plan distribution array
   */
  async _getPlanDistribution(organizationId) {
    try {
      // Get all plans for organization
      const plansResult = await plansService.getPlansByOrganization(
        organizationId,
        1000,
        0
      );
      const orgPlans = plansResult.plans;

      // Get all user-plan assignments for this organization
      const assignments = await db
        .select({
          planId: userPlans.planId,
          planName: plans.name,
          planSlug: plans.slug,
        })
        .from(userPlans)
        .innerJoin(plans, eq(userPlans.planId, plans.id))
        .where(eq(userPlans.organizationId, organizationId));

      // Count users per plan
      const planCounts = {};
      assignments.forEach((assignment) => {
        const planId = assignment.planId;
        if (!planCounts[planId]) {
          planCounts[planId] = {
            planId,
            planName: assignment.planName,
            planSlug: assignment.planSlug,
            userCount: 0,
          };
        }
        planCounts[planId].userCount++;
      });

      // Include plans with 0 users
      orgPlans.forEach((plan) => {
        if (!planCounts[plan.id]) {
          planCounts[plan.id] = {
            planId: plan.id,
            planName: plan.name,
            planSlug: plan.slug,
            userCount: 0,
          };
        }
      });

      return Object.values(planCounts);
    } catch (error) {
      logger.error(
        { error, organizationId },
        "Failed to get plan distribution"
      );
      return [];
    }
  }

  /**
   * Get top features by usage
   * @private
   * @param {number} organizationId - Organization ID
   * @returns {Promise<Array>} Top features by usage
   */
  async _getTopFeaturesByUsage(organizationId) {
    try {
      // Get all features for this organization
      const featuresResult = await featuresService.getAllFeatures(
        organizationId,
        100,
        0
      );
      const allFeatures = featuresResult.features;

      // Get usage stats for each feature
      const featuresWithUsage = await Promise.all(
        allFeatures.slice(0, 20).map(async (feature) => {
          try {
            const stats = await usageService.getUsageByFeature(feature.slug);
            return {
              featureSlug: feature.slug,
              featureName: feature.name,
              usage: stats.totalUsage || 0,
              usersUsingIt: stats.usersUsingIt || 0,
            };
          } catch (error) {
            logger.debug(
              { error, featureSlug: feature.slug },
              "Failed to get usage for feature"
            );
            return {
              featureSlug: feature.slug,
              featureName: feature.name,
              usage: 0,
              usersUsingIt: 0,
            };
          }
        })
      );

      // Sort by usage and return top 5
      return featuresWithUsage.sort((a, b) => b.usage - a.usage).slice(0, 5);
    } catch (error) {
      logger.error(
        { error, organizationId },
        "Failed to get top features by usage"
      );
      return [];
    }
  }

  /**
   * Get recent activity
   * @private
   * @param {number} organizationId - Organization ID
   * @returns {Promise<Array>} Recent activity array
   */
  async _getRecentActivity(organizationId) {
    try {
      const activities = [];

      // Get recent overrides (last 10)
      const orgOverrides = await db
        .select()
        .from(overrides)
        .where(eq(overrides.organizationId, organizationId))
        .orderBy(desc(overrides.createdAt))
        .limit(5);

      orgOverrides.forEach((override) => {
        activities.push({
          type: "override_created",
          description: `Override created for feature "${override.featureSlug}"`,
          featureSlug: override.featureSlug,
          overrideType: override.overrideType,
          timestamp: override.createdAt,
          id: override.id,
        });
      });

      // Get recent role assignments (last 5)
      const recentRoles = await db
        .select({
          id: userRoles.id,
          userId: userRoles.userId,
          roleId: userRoles.roleId,
          roleName: roles.name,
          createdAt: userRoles.createdAt,
        })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .where(eq(userRoles.organizationId, organizationId))
        .orderBy(desc(userRoles.createdAt))
        .limit(5);

      recentRoles.forEach((assignment) => {
        activities.push({
          type: "role_assigned",
          description: `Role "${assignment.roleName}" assigned to user`,
          roleId: assignment.roleId,
          roleName: assignment.roleName,
          timestamp: assignment.createdAt,
          id: assignment.id,
        });
      });

      // Sort by timestamp and return most recent 10
      return activities
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, 10);
    } catch (error) {
      logger.error({ error, organizationId }, "Failed to get recent activity");
      return [];
    }
  }
}

const dashboardService = new DashboardService();
export default dashboardService;
