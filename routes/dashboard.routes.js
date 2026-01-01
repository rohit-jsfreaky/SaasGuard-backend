import express from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import * as dashboardController from '../controllers/dashboard.controller.js';

const router = express.Router();

/**
 * Dashboard Routes
 * All routes require authentication
 */

// GET /api/admin/organizations/:orgId/overview - Get dashboard overview
router.get('/organizations/:orgId/overview', authenticate, dashboardController.getDashboardOverview);

export default router;

