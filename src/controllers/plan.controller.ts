/**
 * Plan Controller
 * Pure controller functions for plan management
 */

import type { Request, Response } from "express";
import { planService } from "../services/plan.service.js";
import { planFeatureService } from "../services/plan-feature.service.js";
import { planLimitService } from "../services/plan-limit.service.js";
import {
  CreatePlanSchema,
  UpdatePlanSchema,
  AddFeatureToPlanSchema,
  SetLimitSchema,
} from "../validators/plan.validator.js";
import { PaginationSchema } from "../validators/feature.validator.js";
import type { ApiResponse } from "../types/index.js";
import type { Plan, PlanLimit } from "../types/db.js";
import type { PlanFeatureWithDetails } from "../services/plan-feature.service.js";
import { ValidationError, NotFoundError, ConflictError } from "../utils/errors.js";
import { successResponse } from "../utils/async-handler.js";

/**
 * Plan list response type
 */
export interface PlanListResponse {
  plans: Plan[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

/**
 * Plan with features response
 */
export interface PlanWithFeaturesResponse extends Plan {
  features: PlanFeatureWithDetails[];
  limits: PlanLimit[];
}

// =============================================================================
// PLAN CRUD CONTROLLERS
// =============================================================================

/**
 * Create a new plan
 */
export async function createPlan(
  req: Request,
  res: Response
): Promise<ApiResponse<Plan>> {
  const parsed = CreatePlanSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError("Invalid input", parsed.error.flatten().fieldErrors);
  }

  const { name, slug, description } = parsed.data;

  try {
    const plan = await planService.createPlan(name, slug, description);
    res.statusCode = 201;
    return successResponse(plan, "Plan created successfully", 201).response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create plan";
    if (message.includes("already exists")) {
      throw new ConflictError(message);
    }
    throw error;
  }
}

/**
 * List all plans
 */
export async function listPlans(
  req: Request,
  res: Response
): Promise<ApiResponse<PlanListResponse>> {
  const pagination = PaginationSchema.safeParse(req.query);
  const { limit, offset } = pagination.success
    ? pagination.data
    : { limit: 50, offset: 0 };

  const result = await planService.getAllPlans({ limit, offset });

  return successResponse({
    plans: result.plans,
    pagination: {
      total: result.total,
      limit: result.limit,
      offset: result.offset,
      hasMore: result.offset + result.plans.length < result.total,
    },
  }).response;
}

/**
 * Get a plan by ID with features and limits
 */
export async function getPlan(
  req: Request,
  res: Response
): Promise<ApiResponse<PlanWithFeaturesResponse>> {
  const { id } = req.params;
  if (!id) {
    throw new ValidationError("Plan ID is required");
  }

  const plan = await planService.getPlan(id);
  if (!plan) {
    throw new NotFoundError("Plan", id);
  }

  const [features, limits] = await Promise.all([
    planFeatureService.getPlanFeatures(plan.id),
    planLimitService.getPlanLimits(plan.id),
  ]);

  return successResponse({ ...plan, features, limits }).response;
}

/**
 * Update a plan
 */
export async function updatePlan(
  req: Request,
  res: Response
): Promise<ApiResponse<Plan>> {
  const { id } = req.params;
  if (!id) {
    throw new ValidationError("Plan ID is required");
  }

  const planId = parseInt(id, 10);
  if (isNaN(planId)) {
    throw new ValidationError("Plan ID must be a number");
  }

  const parsed = UpdatePlanSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError("Invalid input", parsed.error.flatten().fieldErrors);
  }

  const updates: { name?: string; description?: string | null } = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;

  try {
    const plan = await planService.updatePlan(planId, updates);
    return successResponse(plan, "Plan updated successfully").response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update plan";
    if (message.includes("not found")) {
      throw new NotFoundError("Plan", planId);
    }
    throw error;
  }
}

/**
 * Delete a plan
 */
export async function deletePlan(
  req: Request,
  res: Response
): Promise<ApiResponse<{ deleted: boolean }>> {
  const { id } = req.params;
  if (!id) {
    throw new ValidationError("Plan ID is required");
  }

  const planId = parseInt(id, 10);
  if (isNaN(planId)) {
    throw new ValidationError("Plan ID must be a number");
  }

  try {
    await planService.deletePlan(planId);
    return successResponse({ deleted: true }, "Plan deleted successfully").response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete plan";
    if (message.includes("not found")) {
      throw new NotFoundError("Plan", planId);
    }
    throw error;
  }
}

// =============================================================================
// PLAN FEATURES CONTROLLERS
// =============================================================================

/**
 * Add a feature to a plan
 */
export async function addFeatureToPlan(
  req: Request,
  res: Response
): Promise<ApiResponse<{ added: boolean }>> {
  const { id } = req.params;
  const planId = parseInt(id ?? "", 10);
  if (isNaN(planId)) {
    throw new ValidationError("Invalid plan ID");
  }

  const parsed = AddFeatureToPlanSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError("Invalid input", parsed.error.flatten().fieldErrors);
  }

  await planFeatureService.addFeatureToPlan(
    planId,
    parsed.data.featureId,
    parsed.data.enabled
  );

  res.statusCode = 201;
  return successResponse(
    { added: true },
    "Feature added to plan successfully",
    201
  ).response;
}

/**
 * Get all features for a plan
 */
export async function getPlanFeatures(
  req: Request,
  res: Response
): Promise<ApiResponse<PlanFeatureWithDetails[]>> {
  const { id } = req.params;
  const planId = parseInt(id ?? "", 10);
  if (isNaN(planId)) {
    throw new ValidationError("Invalid plan ID");
  }

  const features = await planFeatureService.getPlanFeatures(planId);
  return successResponse(features).response;
}

/**
 * Remove a feature from a plan
 */
export async function removeFeatureFromPlan(
  req: Request,
  res: Response
): Promise<ApiResponse<{ removed: boolean }>> {
  const { id, featureId } = req.params;
  const planId = parseInt(id ?? "", 10);
  const fId = parseInt(featureId ?? "", 10);

  if (isNaN(planId) || isNaN(fId)) {
    throw new ValidationError("Invalid IDs");
  }

  try {
    await planFeatureService.removeFeatureFromPlan(planId, fId);
    return successResponse(
      { removed: true },
      "Feature removed from plan successfully"
    ).response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to remove feature";
    if (message.includes("not found")) {
      throw new NotFoundError("Plan feature");
    }
    throw error;
  }
}

// =============================================================================
// PLAN LIMITS CONTROLLERS
// =============================================================================

/**
 * Set a limit for a feature in a plan
 */
export async function setPlanLimit(
  req: Request,
  res: Response
): Promise<ApiResponse<PlanLimit>> {
  const { id } = req.params;
  const planId = parseInt(id ?? "", 10);
  if (isNaN(planId)) {
    throw new ValidationError("Invalid plan ID");
  }

  const parsed = SetLimitSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError("Invalid input", parsed.error.flatten().fieldErrors);
  }

  const limit = await planLimitService.setLimitForFeature(
    planId,
    parsed.data.featureSlug,
    parsed.data.maxLimit
  );

  res.statusCode = 201;
  return successResponse(limit, "Limit set successfully", 201).response;
}

/**
 * Get all limits for a plan
 */
export async function getPlanLimits(
  req: Request,
  res: Response
): Promise<ApiResponse<PlanLimit[]>> {
  const { id } = req.params;
  const planId = parseInt(id ?? "", 10);
  if (isNaN(planId)) {
    throw new ValidationError("Invalid plan ID");
  }

  const limits = await planLimitService.getPlanLimits(planId);
  return successResponse(limits).response;
}

/**
 * Remove a limit from a plan (makes feature unlimited)
 */
export async function removePlanLimit(
  req: Request,
  res: Response
): Promise<ApiResponse<{ removed: boolean }>> {
  const { id, featureSlug } = req.params;
  const planId = parseInt(id ?? "", 10);

  if (isNaN(planId) || !featureSlug) {
    throw new ValidationError("Invalid parameters");
  }

  try {
    await planLimitService.removeLimitForFeature(planId, featureSlug);
    return successResponse({ removed: true }, "Limit removed successfully").response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to remove limit";
    if (message.includes("not found")) {
      throw new NotFoundError("Plan limit");
    }
    throw error;
  }
}
