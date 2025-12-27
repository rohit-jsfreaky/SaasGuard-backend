import asyncHandler from '../utilities/async-handler.js';
import featuresService from '../services/features.service.js';
import { NotFoundError, ValidationError } from '../utilities/errors.js';
import { validateFeatureName, validateFeatureSlug } from '../utilities/validators.js';
import logger from '../utilities/logger.js';

/**
 * POST /api/admin/features
 * Create new feature
 */
export const createFeature = asyncHandler(async (req, res) => {
  const { name, slug, description } = req.body;

  // Validate inputs
  const nameError = validateFeatureName(name);
  if (nameError) {
    throw new ValidationError(nameError);
  }

  const slugError = validateFeatureSlug(slug);
  if (slugError) {
    throw new ValidationError(slugError);
  }

  const feature = await featuresService.createFeature(name, slug, description);

  logger.info({ featureId: feature.id, name, slug }, 'Feature created via API');

  res.status(201).json({
    success: true,
    data: feature
  });
});

/**
 * GET /api/admin/features
 * List all features with pagination and search
 */
export const getAllFeatures = asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit || '100', 10);
  const offset = parseInt(req.query.offset || '0', 10);
  const search = req.query.search;

  // If search query provided, use search method
  if (search) {
    const features = await featuresService.searchFeatures(search);
    return res.json({
      success: true,
      data: features,
      pagination: {
        total: features.length,
        limit: features.length,
        offset: 0,
        hasMore: false
      }
    });
  }

  const result = await featuresService.getAllFeatures(limit, offset);

  res.json({
    success: true,
    data: result.features,
    pagination: {
      total: result.total,
      limit,
      offset,
      hasMore: result.hasMore
    }
  });
});

/**
 * GET /api/admin/features/:id
 * Get feature by ID or slug
 */
export const getFeature = asyncHandler(async (req, res) => {
  const identifier = req.params.id;

  const feature = await featuresService.getFeature(identifier);

  if (!feature) {
    throw new NotFoundError('Feature not found');
  }

  res.json({
    success: true,
    data: feature
  });
});

/**
 * PUT /api/admin/features/:id
 * Update feature
 */
export const updateFeature = asyncHandler(async (req, res) => {
  const featureId = parseInt(req.params.id, 10);
  const updates = req.body;

  if (isNaN(featureId)) {
    throw new ValidationError('Invalid feature ID');
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
    throw new ValidationError('Feature slug cannot be updated (immutable)');
  }

  const updatedFeature = await featuresService.updateFeature(featureId, updates);

  logger.info({ featureId, updates }, 'Feature updated via API');

  res.json({
    success: true,
    data: updatedFeature
  });
});

/**
 * DELETE /api/admin/features/:id
 * Delete feature
 */
export const deleteFeature = asyncHandler(async (req, res) => {
  const featureId = parseInt(req.params.id, 10);

  if (isNaN(featureId)) {
    throw new ValidationError('Invalid feature ID');
  }

  await featuresService.deleteFeature(featureId);

  logger.info({ featureId }, 'Feature deleted via API');

  res.status(204).send();
});

/**
 * GET /api/admin/features/search
 * Search features by name or description
 */
export const searchFeatures = asyncHandler(async (req, res) => {
  const query = req.query.q;

  if (!query || query.trim().length === 0) {
    throw new ValidationError('Search query (q) is required');
  }

  const results = await featuresService.searchFeatures(query);

  res.json({
    success: true,
    data: results,
    pagination: {
      total: results.length,
      limit: results.length,
      offset: 0,
      hasMore: false
    }
  });
});
