import express from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requireAdmin } from '../middlewares/admin-check.middleware.js';
import * as featuresController from '../controllers/features.controller.js';

const router = express.Router();

/**
 * Feature Registry Routes
 * All routes require authentication and admin access
 * Features are globally unique and application-wide
 */

// POST /api/admin/features - Create feature
router.post('/', authenticate, requireAdmin, featuresController.createFeature);

// GET /api/admin/features - List all features (with pagination and search)
router.get('/', authenticate, requireAdmin, featuresController.getAllFeatures);

// GET /api/admin/features/search - Search features
router.get('/search', authenticate, requireAdmin, featuresController.searchFeatures);

// GET /api/admin/features/:id - Get feature by ID or slug
router.get('/:id', authenticate, requireAdmin, featuresController.getFeature);

// PUT /api/admin/features/:id - Update feature
router.put('/:id', authenticate, requireAdmin, featuresController.updateFeature);

// DELETE /api/admin/features/:id - Delete feature
router.delete('/:id', authenticate, requireAdmin, featuresController.deleteFeature);

export default router;

