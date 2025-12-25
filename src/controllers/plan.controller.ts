import { Router, type Request, type Response } from "express";
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
import type { ApiResponse, ApiErrorResponse } from "../types/index.js";
import type { Plan, PlanLimit } from "../types/db.js";
import type { PlanFeatureWithDetails } from "../services/plan-feature.service.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = Router();

/**
 * Plan list response type
 */
interface PlanListResponse {
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
interface PlanWithFeaturesResponse extends Plan {
  features: PlanFeatureWithDetails[];
  limits: PlanLimit[];
}

// =============================================================================
// PLAN CRUD ROUTES
// =============================================================================

/**
 * POST /admin/plans
 * Create a new plan
 */
router.post(
  "/",
  requireAuth,
  async (
    req: Request,
    res: Response<ApiResponse<Plan> | ApiErrorResponse>
  ): Promise<void> => {
    try {
      const parsed = CreatePlanSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid input",
            details: parsed.error.flatten().fieldErrors,
          },
        });
        return;
      }

      const { name, slug, description } = parsed.data;
      const plan = await planService.createPlan(name, slug, description);

      res.status(201).json({
        success: true,
        data: plan,
        message: "Plan created successfully",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create plan";

      if (message.includes("already exists")) {
        res.status(409).json({
          success: false,
          error: { code: "DUPLICATE_SLUG", message },
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: { code: "CREATE_FAILED", message },
      });
    }
  }
);

/**
 * GET /admin/plans
 * List all plans
 */
router.get(
  "/",
  async (
    req: Request,
    res: Response<ApiResponse<PlanListResponse> | ApiErrorResponse>
  ): Promise<void> => {
    try {
      const pagination = PaginationSchema.safeParse(req.query);
      const { limit, offset } = pagination.success
        ? pagination.data
        : { limit: 50, offset: 0 };

      const result = await planService.getAllPlans({ limit, offset });

      res.status(200).json({
        success: true,
        data: {
          plans: result.plans,
          pagination: {
            total: result.total,
            limit: result.limit,
            offset: result.offset,
            hasMore: result.offset + result.plans.length < result.total,
          },
        },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to list plans";
      res.status(500).json({
        success: false,
        error: { code: "LIST_FAILED", message },
      });
    }
  }
);

/**
 * GET /admin/plans/:id
 * Get a plan by ID with features and limits
 */
router.get(
  "/:id",
  async (
    req: Request,
    res: Response<ApiResponse<PlanWithFeaturesResponse> | ApiErrorResponse>
  ): Promise<void> => {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Plan ID is required" },
        });
        return;
      }

      const plan = await planService.getPlan(id);
      if (!plan) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: `Plan not found: ${id}` },
        });
        return;
      }

      // Get features and limits
      const [features, limits] = await Promise.all([
        planFeatureService.getPlanFeatures(plan.id),
        planLimitService.getPlanLimits(plan.id),
      ]);

      res.status(200).json({
        success: true,
        data: { ...plan, features, limits },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to get plan";
      res.status(500).json({
        success: false,
        error: { code: "GET_FAILED", message },
      });
    }
  }
);

/**
 * PUT /admin/plans/:id
 * Update a plan
 */
router.put(
  "/:id",
  requireAuth,
  async (
    req: Request,
    res: Response<ApiResponse<Plan> | ApiErrorResponse>
  ): Promise<void> => {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Plan ID is required" },
        });
        return;
      }

      const planId = parseInt(id, 10);
      if (isNaN(planId)) {
        res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Plan ID must be a number",
          },
        });
        return;
      }

      const parsed = UpdatePlanSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid input",
            details: parsed.error.flatten().fieldErrors,
          },
        });
        return;
      }

      const updates: { name?: string; description?: string | null } = {};
      if (parsed.data.name !== undefined) updates.name = parsed.data.name;
      if (parsed.data.description !== undefined)
        updates.description = parsed.data.description;

      const plan = await planService.updatePlan(planId, updates);

      res.status(200).json({
        success: true,
        data: plan,
        message: "Plan updated successfully",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update plan";

      if (message.includes("not found")) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message },
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: { code: "UPDATE_FAILED", message },
      });
    }
  }
);

/**
 * DELETE /admin/plans/:id
 * Delete a plan
 */
router.delete(
  "/:id",
  requireAuth,
  async (
    req: Request,
    res: Response<ApiResponse<{ deleted: boolean }> | ApiErrorResponse>
  ): Promise<void> => {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Plan ID is required" },
        });
        return;
      }

      const planId = parseInt(id, 10);
      if (isNaN(planId)) {
        res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Plan ID must be a number",
          },
        });
        return;
      }

      await planService.deletePlan(planId);

      res.status(200).json({
        success: true,
        data: { deleted: true },
        message: "Plan deleted successfully",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to delete plan";

      if (message.includes("not found")) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message },
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: { code: "DELETE_FAILED", message },
      });
    }
  }
);

// =============================================================================
// PLAN FEATURES ROUTES
// =============================================================================

/**
 * POST /admin/plans/:id/features
 * Add a feature to a plan
 */
router.post(
  "/:id/features",
  requireAuth,
  async (
    req: Request,
    res: Response<ApiResponse<{ added: boolean }> | ApiErrorResponse>
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const planId = parseInt(id ?? "", 10);
      if (isNaN(planId)) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Invalid plan ID" },
        });
        return;
      }

      const parsed = AddFeatureToPlanSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid input",
            details: parsed.error.flatten().fieldErrors,
          },
        });
        return;
      }

      await planFeatureService.addFeatureToPlan(
        planId,
        parsed.data.featureId,
        parsed.data.enabled
      );

      res.status(201).json({
        success: true,
        data: { added: true },
        message: "Feature added to plan successfully",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to add feature";
      res.status(500).json({
        success: false,
        error: { code: "ADD_FEATURE_FAILED", message },
      });
    }
  }
);

/**
 * GET /admin/plans/:id/features
 * Get all features for a plan
 */
router.get(
  "/:id/features",
  async (
    req: Request,
    res: Response<ApiResponse<PlanFeatureWithDetails[]> | ApiErrorResponse>
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const planId = parseInt(id ?? "", 10);
      if (isNaN(planId)) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Invalid plan ID" },
        });
        return;
      }

      const features = await planFeatureService.getPlanFeatures(planId);

      res.status(200).json({
        success: true,
        data: features,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to get features";
      res.status(500).json({
        success: false,
        error: { code: "GET_FEATURES_FAILED", message },
      });
    }
  }
);

/**
 * DELETE /admin/plans/:id/features/:featureId
 * Remove a feature from a plan
 */
router.delete(
  "/:id/features/:featureId",
  requireAuth,
  async (
    req: Request,
    res: Response<ApiResponse<{ removed: boolean }> | ApiErrorResponse>
  ): Promise<void> => {
    try {
      const { id, featureId } = req.params;
      const planId = parseInt(id ?? "", 10);
      const fId = parseInt(featureId ?? "", 10);

      if (isNaN(planId) || isNaN(fId)) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Invalid IDs" },
        });
        return;
      }

      await planFeatureService.removeFeatureFromPlan(planId, fId);

      res.status(200).json({
        success: true,
        data: { removed: true },
        message: "Feature removed from plan successfully",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to remove feature";

      if (message.includes("not found")) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message },
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: { code: "REMOVE_FEATURE_FAILED", message },
      });
    }
  }
);

// =============================================================================
// PLAN LIMITS ROUTES
// =============================================================================

/**
 * POST /admin/plans/:id/limits
 * Set a limit for a feature in a plan
 */
router.post(
  "/:id/limits",
  requireAuth,
  async (
    req: Request,
    res: Response<ApiResponse<PlanLimit> | ApiErrorResponse>
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const planId = parseInt(id ?? "", 10);
      if (isNaN(planId)) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Invalid plan ID" },
        });
        return;
      }

      const parsed = SetLimitSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid input",
            details: parsed.error.flatten().fieldErrors,
          },
        });
        return;
      }

      const limit = await planLimitService.setLimitForFeature(
        planId,
        parsed.data.featureSlug,
        parsed.data.maxLimit
      );

      res.status(201).json({
        success: true,
        data: limit,
        message: "Limit set successfully",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to set limit";
      res.status(500).json({
        success: false,
        error: { code: "SET_LIMIT_FAILED", message },
      });
    }
  }
);

/**
 * GET /admin/plans/:id/limits
 * Get all limits for a plan
 */
router.get(
  "/:id/limits",
  async (
    req: Request,
    res: Response<ApiResponse<PlanLimit[]> | ApiErrorResponse>
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const planId = parseInt(id ?? "", 10);
      if (isNaN(planId)) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Invalid plan ID" },
        });
        return;
      }

      const limits = await planLimitService.getPlanLimits(planId);

      res.status(200).json({
        success: true,
        data: limits,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to get limits";
      res.status(500).json({
        success: false,
        error: { code: "GET_LIMITS_FAILED", message },
      });
    }
  }
);

/**
 * DELETE /admin/plans/:id/limits/:featureSlug
 * Remove a limit from a plan (makes feature unlimited)
 */
router.delete(
  "/:id/limits/:featureSlug",
  requireAuth,
  async (
    req: Request,
    res: Response<ApiResponse<{ removed: boolean }> | ApiErrorResponse>
  ): Promise<void> => {
    try {
      const { id, featureSlug } = req.params;
      const planId = parseInt(id ?? "", 10);

      if (isNaN(planId) || !featureSlug) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Invalid parameters" },
        });
        return;
      }

      await planLimitService.removeLimitForFeature(planId, featureSlug);

      res.status(200).json({
        success: true,
        data: { removed: true },
        message: "Limit removed successfully",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to remove limit";

      if (message.includes("not found")) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message },
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: { code: "REMOVE_LIMIT_FAILED", message },
      });
    }
  }
);

export default router;
