import asyncHandler from "../utilities/async-handler.js";
import featuresService from "../services/features.service.js";
import { NotFoundError, ValidationError } from "../utilities/errors.js";
import {
  validateFeatureName,
  validateFeatureSlug,
} from "../utilities/validators.js";
import logger from "../utilities/logger.js";

/**
 * POST /api/admin/features
 * Create new feature (organization-scoped)
 */
export const createFeature = asyncHandler(async (req, res) => {
  const { name, slug, description } = req.body;
  const orgId = req.orgId; // From admin-check middleware

  if (!orgId) {
    throw new ValidationError("Organization context required");
  }

  // Validate inputs
  const nameError = validateFeatureName(name);
  if (nameError) {
    throw new ValidationError(nameError);
  }

  const slugError = validateFeatureSlug(slug);
  if (slugError) {
    throw new ValidationError(slugError);
  }

  const feature = await featuresService.createFeature(
    orgId,
    name,
    slug,
    description
  );

  logger.info(
    { featureId: feature.id, orgId, name, slug },
    "Feature created via API"
  );

  res.status(201).json({
    success: true,
    data: feature,
  });
});

/**
 * GET /api/admin/features
 * List all features for organization with pagination and search
 */
export const getAllFeatures = asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit || "100", 10);
  const offset = parseInt(req.query.offset || "0", 10);
  const search = req.query.search;
  const orgId = req.orgId; // From admin-check middleware

  if (!orgId) {
    throw new ValidationError("Organization context required");
  }

  // If search query provided, use search method
  if (search) {
    const features = await featuresService.searchFeatures(orgId, search);
    return res.json({
      success: true,
      data: features,
      pagination: {
        total: features.length,
        limit: features.length,
        offset: 0,
        hasMore: false,
      },
    });
  }

  const result = await featuresService.getAllFeatures(orgId, limit, offset);

  res.json({
    success: true,
    data: result.features,
    pagination: {
      total: result.total,
      limit,
      offset,
      hasMore: result.hasMore,
    },
  });
});

/**
 * GET /api/admin/features/:id
 * Get feature by ID
 */
export const getFeature = asyncHandler(async (req, res) => {
  const featureId = parseInt(req.params.id, 10);
  const orgId = req.orgId;

  if (isNaN(featureId)) {
    throw new ValidationError("Invalid feature ID");
  }

  const feature = await featuresService.getFeature(featureId);

  if (!feature) {
    throw new NotFoundError("Feature not found");
  }

  // Verify feature belongs to this organization
  if (feature.organizationId !== orgId) {
    throw new NotFoundError("Feature not found");
  }

  res.json({
    success: true,
    data: feature,
  });
});

/**
 * PUT /api/admin/features/:id
 * Update feature
 */
export const updateFeature = asyncHandler(async (req, res) => {
  const featureId = parseInt(req.params.id, 10);
  const updates = req.body;
  const orgId = req.orgId;

  if (isNaN(featureId)) {
    throw new ValidationError("Invalid feature ID");
  }

  // Get feature first to verify ownership
  const existing = await featuresService.getFeature(featureId);
  if (!existing || existing.organizationId !== orgId) {
    throw new NotFoundError("Feature not found");
  }

  // Validate name if provided
  if (updates.name !== undefined) {
    const nameError = validateFeatureName(updates.name);
    if (nameError) {
      throw new ValidationError(nameError);
    }
  }

  // Prevent slug updates
  if (updates.slug !== undefined) {
    throw new ValidationError("Feature slug cannot be updated (immutable)");
  }

  const updatedFeature = await featuresService.updateFeature(
    featureId,
    updates
  );

  logger.info({ featureId, orgId, updates }, "Feature updated via API");

  res.json({
    success: true,
    data: updatedFeature,
  });
});

/**
 * DELETE /api/admin/features/:id
 * Delete feature
 */
export const deleteFeature = asyncHandler(async (req, res) => {
  const featureId = parseInt(req.params.id, 10);
  const orgId = req.orgId;

  if (isNaN(featureId)) {
    throw new ValidationError("Invalid feature ID");
  }

  // Get feature first to verify ownership
  const existing = await featuresService.getFeature(featureId);
  if (!existing || existing.organizationId !== orgId) {
    throw new NotFoundError("Feature not found");
  }

  await featuresService.deleteFeature(featureId);

  logger.info({ featureId, orgId }, "Feature deleted via API");

  res.status(204).send();
});

/**
 * GET /api/admin/features/search
 * Search features by name or description (organization-scoped)
 */
export const searchFeatures = asyncHandler(async (req, res) => {
  const query = req.query.q;
  const orgId = req.orgId;

  if (!orgId) {
    throw new ValidationError("Organization context required");
  }

  if (!query || query.trim().length === 0) {
    throw new ValidationError("Search query (q) is required");
  }

  const results = await featuresService.searchFeatures(orgId, query);

  res.json({
    success: true,
    data: results,
    pagination: {
      total: results.length,
      limit: results.length,
      offset: 0,
      hasMore: false,
    },
  });
});
