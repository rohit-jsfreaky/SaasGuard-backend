import { Router, type Request, type Response } from "express";
import { featureService } from "../services/feature.service.js";
import {
  CreateFeatureSchema,
  UpdateFeatureSchema,
  PaginationSchema,
  FeatureSearchSchema,
} from "../validators/feature.validator.js";
import type { ApiResponse, ApiErrorResponse } from "../types/index.js";
import type { Feature } from "../types/db.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = Router();

/**
 * Feature list response type
 */
interface FeatureListResponse {
  features: Feature[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

/**
 * POST /admin/features
 * Create a new feature
 */
router.post(
  "/",
  requireAuth,
  async (
    req: Request,
    res: Response<ApiResponse<Feature> | ApiErrorResponse>
  ): Promise<void> => {
    try {
      // Validate input
      const parsed = CreateFeatureSchema.safeParse(req.body);
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

      // Create feature
      const feature = await featureService.createFeature(
        name,
        slug,
        description
      );

      res.status(201).json({
        success: true,
        data: feature,
        message: "Feature created successfully",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create feature";

      // Check for duplicate slug error
      if (message.includes("already exists")) {
        res.status(409).json({
          success: false,
          error: {
            code: "DUPLICATE_SLUG",
            message,
          },
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: {
          code: "CREATE_FAILED",
          message,
        },
      });
    }
  }
);

/**
 * GET /admin/features
 * List all features with pagination
 */
router.get(
  "/",
  async (
    req: Request,
    res: Response<ApiResponse<FeatureListResponse> | ApiErrorResponse>
  ): Promise<void> => {
    try {
      // Parse pagination
      const pagination = PaginationSchema.safeParse(req.query);
      const { limit, offset } = pagination.success
        ? pagination.data
        : { limit: 50, offset: 0 };

      // Check for search query
      const searchQuery = req.query["q"] || req.query["search"];

      let result;
      if (typeof searchQuery === "string" && searchQuery.length > 0) {
        result = await featureService.searchFeatures(searchQuery, {
          limit,
          offset,
        });
      } else {
        result = await featureService.getAllFeatures({ limit, offset });
      }

      res.status(200).json({
        success: true,
        data: {
          features: result.features,
          pagination: {
            total: result.total,
            limit: result.limit,
            offset: result.offset,
            hasMore: result.offset + result.features.length < result.total,
          },
        },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to list features";
      res.status(500).json({
        success: false,
        error: {
          code: "LIST_FAILED",
          message,
        },
      });
    }
  }
);

/**
 * GET /admin/features/search
 * Search features by name or description
 */
router.get(
  "/search",
  async (
    req: Request,
    res: Response<ApiResponse<FeatureListResponse> | ApiErrorResponse>
  ): Promise<void> => {
    try {
      // Validate search query
      const searchParsed = FeatureSearchSchema.safeParse({
        query: req.query["q"],
      });
      if (!searchParsed.success) {
        res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Search query is required",
          },
        });
        return;
      }

      // Parse pagination
      const pagination = PaginationSchema.safeParse(req.query);
      const { limit, offset } = pagination.success
        ? pagination.data
        : { limit: 50, offset: 0 };

      const result = await featureService.searchFeatures(
        searchParsed.data.query,
        { limit, offset }
      );

      res.status(200).json({
        success: true,
        data: {
          features: result.features,
          pagination: {
            total: result.total,
            limit: result.limit,
            offset: result.offset,
            hasMore: result.offset + result.features.length < result.total,
          },
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Search failed";
      res.status(500).json({
        success: false,
        error: {
          code: "SEARCH_FAILED",
          message,
        },
      });
    }
  }
);

/**
 * GET /admin/features/:id
 * Get a single feature by ID or slug
 */
router.get(
  "/:id",
  async (
    req: Request,
    res: Response<ApiResponse<Feature> | ApiErrorResponse>
  ): Promise<void> => {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Feature ID is required",
          },
        });
        return;
      }

      const feature = await featureService.getFeature(id);

      if (!feature) {
        res.status(404).json({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: `Feature not found: ${id}`,
          },
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: feature,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to get feature";
      res.status(500).json({
        success: false,
        error: {
          code: "GET_FAILED",
          message,
        },
      });
    }
  }
);

/**
 * PUT /admin/features/:id
 * Update a feature (name and description only, slug is immutable)
 */
router.put(
  "/:id",
  requireAuth,
  async (
    req: Request,
    res: Response<ApiResponse<Feature> | ApiErrorResponse>
  ): Promise<void> => {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Feature ID is required",
          },
        });
        return;
      }

      // Parse ID as number
      const featureId = parseInt(id, 10);
      if (isNaN(featureId)) {
        res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Feature ID must be a number",
          },
        });
        return;
      }

      // Validate input
      const parsed = UpdateFeatureSchema.safeParse(req.body);
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

      // Update feature - only pass defined values
      const updates: { name?: string; description?: string | null } = {};
      if (parsed.data.name !== undefined) {
        updates.name = parsed.data.name;
      }
      if (parsed.data.description !== undefined) {
        updates.description = parsed.data.description;
      }

      const feature = await featureService.updateFeature(featureId, updates);

      res.status(200).json({
        success: true,
        data: feature,
        message: "Feature updated successfully",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update feature";

      if (message.includes("not found")) {
        res.status(404).json({
          success: false,
          error: {
            code: "NOT_FOUND",
            message,
          },
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: {
          code: "UPDATE_FAILED",
          message,
        },
      });
    }
  }
);

/**
 * DELETE /admin/features/:id
 * Delete a feature (fails if in use)
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
          error: {
            code: "VALIDATION_ERROR",
            message: "Feature ID is required",
          },
        });
        return;
      }

      // Parse ID as number
      const featureId = parseInt(id, 10);
      if (isNaN(featureId)) {
        res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Feature ID must be a number",
          },
        });
        return;
      }

      // Delete feature
      await featureService.deleteFeature(featureId);

      res.status(200).json({
        success: true,
        data: { deleted: true },
        message: "Feature deleted successfully",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to delete feature";

      if (message.includes("not found")) {
        res.status(404).json({
          success: false,
          error: {
            code: "NOT_FOUND",
            message,
          },
        });
        return;
      }

      if (message.includes("Cannot delete")) {
        res.status(409).json({
          success: false,
          error: {
            code: "FEATURE_IN_USE",
            message,
          },
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: {
          code: "DELETE_FAILED",
          message,
        },
      });
    }
  }
);

export default router;
