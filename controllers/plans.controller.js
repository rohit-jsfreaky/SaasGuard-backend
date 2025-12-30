import asyncHandler from "../utilities/async-handler.js";
import plansService from "../services/plans.service.js";
import planFeaturesService from "../services/plan-features.service.js";
import planLimitsService from "../services/plan-limits.service.js";
import { NotFoundError, ValidationError } from "../utilities/errors.js";
import {
  validatePlanName,
  validatePlanSlug,
  validateLimit,
} from "../utilities/validators.js";
import logger from "../utilities/logger.js";

/**
 * POST /api/admin/organizations/:orgId/plans
 * Create new plan
 */
export const createPlan = asyncHandler(async (req, res) => {
  const orgId = parseInt(req.params.orgId, 10);
  const { name, slug, description } = req.body;

  if (isNaN(orgId)) {
    throw new ValidationError("Invalid organization ID");
  }

  // Validate inputs
  const nameError = validatePlanName(name);
  if (nameError) {
    throw new ValidationError(nameError);
  }

  const slugError = validatePlanSlug(slug);
  if (slugError) {
    throw new ValidationError(slugError);
  }

  const plan = await plansService.createPlan(orgId, name, slug, description);

  logger.info({ planId: plan.id, orgId, name, slug }, "Plan created via API");

  res.status(201).json({
    success: true,
    data: plan,
  });
});

/**
 * GET /api/admin/organizations/:orgId/plans
 * List all plans for organization with pagination
 */
export const getPlansByOrganization = asyncHandler(async (req, res) => {
  const orgId = parseInt(req.params.orgId, 10);
  const limit = parseInt(req.query.limit || "50", 10);
  const offset = parseInt(req.query.offset || "0", 10);

  if (isNaN(orgId)) {
    throw new ValidationError("Invalid organization ID");
  }

  const result = await plansService.getPlansByOrganization(
    orgId,
    limit,
    offset
  );

  res.json({
    success: true,
    data: result.plans,
    pagination: {
      total: result.total,
      limit,
      offset,
      hasMore: result.hasMore,
    },
  });
});

/**
 * GET /api/admin/plans/:planId
 * Get plan by ID with features
 */
export const getPlan = asyncHandler(async (req, res) => {
  const planId = parseInt(req.params.planId, 10);

  if (isNaN(planId)) {
    throw new ValidationError("Invalid plan ID");
  }

  const plan = await plansService.getPlanWithFeatures(planId);

  if (!plan) {
    throw new NotFoundError("Plan not found");
  }

  res.json({
    success: true,
    data: plan,
  });
});

/**
 * PUT /api/admin/plans/:planId
 * Update plan (name and description only, slug is immutable)
 */
export const updatePlan = asyncHandler(async (req, res) => {
  const planId = parseInt(req.params.planId, 10);
  const updates = req.body;

  if (isNaN(planId)) {
    throw new ValidationError("Invalid plan ID");
  }

  // Validate name if provided
  if (updates.name !== undefined) {
    const nameError = validatePlanName(updates.name);
    if (nameError) {
      throw new ValidationError(nameError);
    }
  }

  // Prevent slug updates
  if (updates.slug !== undefined) {
    throw new ValidationError("Plan slug cannot be updated (immutable)");
  }

  const updatedPlan = await plansService.updatePlan(planId, updates);

  logger.info({ planId, updates }, "Plan updated via API");

  res.json({
    success: true,
    data: updatedPlan,
  });
});

/**
 * DELETE /api/admin/plans/:planId
 * Delete plan (checks if users are assigned)
 */
export const deletePlan = asyncHandler(async (req, res) => {
  const planId = parseInt(req.params.planId, 10);

  if (isNaN(planId)) {
    throw new ValidationError("Invalid plan ID");
  }

  await plansService.deletePlan(planId);

  logger.info({ planId }, "Plan deleted via API");

  res.status(204).send();
});

/**
 * POST /api/admin/plans/:planId/features
 * Add feature to plan
 */
export const addFeatureToPlan = asyncHandler(async (req, res) => {
  const planId = parseInt(req.params.planId, 10);
  const { featureId, enabled = true } = req.body;

  if (isNaN(planId)) {
    throw new ValidationError("Invalid plan ID");
  }

  if (!featureId) {
    throw new ValidationError("Feature ID is required");
  }

  const featureIdNum = parseInt(featureId, 10);
  if (isNaN(featureIdNum)) {
    throw new ValidationError("Invalid feature ID");
  }

  if (typeof enabled !== "boolean") {
    throw new ValidationError("Enabled must be a boolean");
  }

  await planFeaturesService.addFeatureToPlan(planId, featureIdNum, enabled);

  logger.info(
    { planId, featureId: featureIdNum, enabled },
    "Feature added to plan via API"
  );

  res.status(201).json({
    success: true,
    message: "Feature added to plan",
  });
});

/**
 * DELETE /api/admin/plans/:planId/features/:featureId
 * Remove feature from plan
 */
export const removeFeatureFromPlan = asyncHandler(async (req, res) => {
  const planId = parseInt(req.params.planId, 10);
  const featureId = parseInt(req.params.featureId, 10);

  if (isNaN(planId)) {
    throw new ValidationError("Invalid plan ID");
  }

  if (isNaN(featureId)) {
    throw new ValidationError("Invalid feature ID");
  }

  await planFeaturesService.removeFeatureFromPlan(planId, featureId);

  logger.info({ planId, featureId }, "Feature removed from plan via API");

  res.status(204).send();
});

/**
 * GET /api/admin/plans/:planId/features
 * Get all features in plan
 */
export const getPlanFeatures = asyncHandler(async (req, res) => {
  const planId = parseInt(req.params.planId, 10);

  if (isNaN(planId)) {
    throw new ValidationError("Invalid plan ID");
  }

  const features = await planFeaturesService.getPlanFeatures(planId);

  res.json({
    success: true,
    data: features,
  });
});

/**
 * PUT /api/admin/plans/:planId/features/:featureId
 * Toggle feature enabled/disabled in plan
 */
export const toggleFeatureInPlan = asyncHandler(async (req, res) => {
  const planId = parseInt(req.params.planId, 10);
  const featureId = parseInt(req.params.featureId, 10);
  const { enabled } = req.body;

  if (isNaN(planId)) {
    throw new ValidationError("Invalid plan ID");
  }

  if (isNaN(featureId)) {
    throw new ValidationError("Invalid feature ID");
  }

  if (typeof enabled !== "boolean") {
    throw new ValidationError("Enabled must be a boolean");
  }

  await planFeaturesService.toggleFeatureInPlan(planId, featureId, enabled);

  logger.info(
    { planId, featureId, enabled },
    "Feature toggled in plan via API"
  );

  res.json({
    success: true,
    message: "Feature toggled",
  });
});

/**
 * POST /api/admin/plans/:planId/limits
 * Set limit for feature in plan
 */
export const setFeatureLimit = asyncHandler(async (req, res) => {
  const planId = parseInt(req.params.planId, 10);
  const { featureSlug, maxLimit } = req.body;

  if (isNaN(planId)) {
    throw new ValidationError("Invalid plan ID");
  }

  if (!featureSlug || featureSlug.trim().length === 0) {
    throw new ValidationError("Feature slug is required");
  }

  if (maxLimit === null || maxLimit === undefined) {
    throw new ValidationError("Max limit is required");
  }

  const maxLimitNum = parseInt(maxLimit, 10);
  if (isNaN(maxLimitNum)) {
    throw new ValidationError("Max limit must be a number");
  }

  const limitError = validateLimit(maxLimitNum);
  if (limitError) {
    throw new ValidationError(limitError);
  }

  const limit = await planLimitsService.setLimitForFeature(
    planId,
    featureSlug,
    maxLimitNum
  );

  logger.info(
    { planId, featureSlug, maxLimit: maxLimitNum },
    "Limit set for feature via API"
  );

  res.status(201).json({
    success: true,
    data: limit,
  });
});

/**
 * GET /api/admin/plans/:planId/limits
 * Get all limits for plan
 */
export const getPlanLimits = asyncHandler(async (req, res) => {
  const planId = parseInt(req.params.planId, 10);

  if (isNaN(planId)) {
    throw new ValidationError("Invalid plan ID");
  }

  const limits = await planLimitsService.getPlanLimits(planId);

  res.json({
    success: true,
    data: limits,
  });
});

/**
 * DELETE /api/admin/plans/:planId/limits/:featureSlug
 * Remove limit for feature (makes unlimited)
 */
export const removeFeatureLimit = asyncHandler(async (req, res) => {
  const planId = parseInt(req.params.planId, 10);
  const featureSlug = req.params.featureSlug;

  if (isNaN(planId)) {
    throw new ValidationError("Invalid plan ID");
  }

  if (!featureSlug || featureSlug.trim().length === 0) {
    throw new ValidationError("Feature slug is required");
  }

  await planLimitsService.removeLimitForFeature(planId, featureSlug);

  logger.info({ planId, featureSlug }, "Limit removed for feature via API");

  res.status(204).send();
});
