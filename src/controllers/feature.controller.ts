/**
 * Feature Controller
 * Pure controller functions for feature management
 */

import type { Request, Response } from "express";
import { featureService } from "../services/feature.service.js";
import {
  CreateFeatureSchema,
  UpdateFeatureSchema,
  PaginationSchema,
  FeatureSearchSchema,
} from "../validators/feature.validator.js";
import type { ApiResponse } from "../types/index.js";
import type { Feature } from "../types/db.js";
import { ValidationError, NotFoundError, ConflictError } from "../utils/errors.js";
import { successResponse } from "../utils/async-handler.js";

/**
 * Feature list response type
 */
export interface FeatureListResponse {
  features: Feature[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

/**
 * Create a new feature
 */
export async function createFeature(
  req: Request,
  res: Response
): Promise<ApiResponse<Feature>> {
  const parsed = CreateFeatureSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError("Invalid input", parsed.error.flatten().fieldErrors);
  }

  const { name, slug, description } = parsed.data;

  try {
    const feature = await featureService.createFeature(name, slug, description);
    res.statusCode = 201;
    return successResponse(feature, "Feature created successfully", 201).response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create feature";
    if (message.includes("already exists")) {
      throw new ConflictError(message);
    }
    throw error;
  }
}

/**
 * List all features with pagination
 */
export async function listFeatures(
  req: Request,
  _res: Response
): Promise<ApiResponse<FeatureListResponse>> {
  const pagination = PaginationSchema.safeParse(req.query);
  const { limit, offset } = pagination.success
    ? pagination.data
    : { limit: 50, offset: 0 };

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

  return successResponse({
    features: result.features,
    pagination: {
      total: result.total,
      limit: result.limit,
      offset: result.offset,
      hasMore: result.offset + result.features.length < result.total,
    },
  }).response;
}

/**
 * Search features by name or description
 */
export async function searchFeatures(
  req: Request,
  _res: Response
): Promise<ApiResponse<FeatureListResponse>> {
  const searchParsed = FeatureSearchSchema.safeParse({
    query: req.query["q"],
  });
  if (!searchParsed.success) {
    throw new ValidationError("Search query is required");
  }

  const pagination = PaginationSchema.safeParse(req.query);
  const { limit, offset } = pagination.success
    ? pagination.data
    : { limit: 50, offset: 0 };

  const result = await featureService.searchFeatures(
    searchParsed.data.query,
    { limit, offset }
  );

  return successResponse({
    features: result.features,
    pagination: {
      total: result.total,
      limit: result.limit,
      offset: result.offset,
      hasMore: result.offset + result.features.length < result.total,
    },
  }).response;
}

/**
 * Get a single feature by ID or slug
 */
export async function getFeature(
  req: Request,
  _res: Response
): Promise<ApiResponse<Feature>> {
  const { id } = req.params;

  if (!id) {
    throw new ValidationError("Feature ID is required");
  }

  const feature = await featureService.getFeature(id);

  if (!feature) {
    throw new NotFoundError("Feature", id);
  }

  return successResponse(feature).response;
}

/**
 * Update a feature (name and description only, slug is immutable)
 */
export async function updateFeature(
  req: Request,
  _res: Response
): Promise<ApiResponse<Feature>> {
  const { id } = req.params;

  if (!id) {
    throw new ValidationError("Feature ID is required");
  }

  const featureId = parseInt(id, 10);
  if (isNaN(featureId)) {
    throw new ValidationError("Feature ID must be a number");
  }

  const parsed = UpdateFeatureSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError("Invalid input", parsed.error.flatten().fieldErrors);
  }

  const updates: { name?: string; description?: string | null } = {};
  if (parsed.data.name !== undefined) {
    updates.name = parsed.data.name;
  }
  if (parsed.data.description !== undefined) {
    updates.description = parsed.data.description;
  }

  try {
    const feature = await featureService.updateFeature(featureId, updates);
    return successResponse(feature, "Feature updated successfully").response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update feature";
    if (message.includes("not found")) {
      throw new NotFoundError("Feature", featureId);
    }
    throw error;
  }
}

/**
 * Delete a feature (fails if in use)
 */
export async function deleteFeature(
  req: Request,
  _res: Response
): Promise<ApiResponse<{ deleted: boolean }>> {
  const { id } = req.params;

  if (!id) {
    throw new ValidationError("Feature ID is required");
  }

  const featureId = parseInt(id, 10);
  if (isNaN(featureId)) {
    throw new ValidationError("Feature ID must be a number");
  }

  try {
    await featureService.deleteFeature(featureId);
    return successResponse({ deleted: true }, "Feature deleted successfully").response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete feature";

    if (message.includes("not found")) {
      throw new NotFoundError("Feature", featureId);
    }

    if (message.includes("Cannot delete")) {
      throw new ConflictError(message);
    }

    throw error;
  }
}
