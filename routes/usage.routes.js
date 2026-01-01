import express from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import * as usageController from '../controllers/usage.controller.js';

const router = express.Router();

/**
 * Usage Tracking Routes
 * All routes require authentication
 */

// POST /api/admin/users/:userId/usage/:featureSlug - Record usage
router.post('/users/:userId/usage/:featureSlug', authenticate, usageController.recordUsage);

// GET /api/admin/users/:userId/usage - List all usage for user
router.get('/users/:userId/usage', authenticate, usageController.getUserUsage);

// GET /api/admin/users/:userId/usage/:featureSlug - Get specific usage
router.get('/users/:userId/usage/:featureSlug', authenticate, usageController.getUsage);

// POST /api/admin/users/:userId/usage/:featureSlug/reset - Reset usage
router.post('/users/:userId/usage/:featureSlug/reset', authenticate, usageController.resetUsage);

// POST /api/admin/usage/reset-all - Reset all usage (monthly reset)
router.post('/usage/reset-all', authenticate, usageController.resetAllUsage);

// GET /api/admin/features/:featureSlug/usage - Get feature usage stats
router.get('/features/:featureSlug/usage', authenticate, usageController.getFeatureUsageStats);

export default router;
