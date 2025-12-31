import express from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import * as permissionsController from '../controllers/permissions.controller.js';

const router = express.Router();

// Permissions routes
// GET /api/users/:userId/permissions - Get user permissions
router.get('/users/:userId/permissions', authenticate, permissionsController.getUserPermissions);

// GET /api/me/permissions - Get current user permissions
router.get('/me/permissions', authenticate, permissionsController.getCurrentUserPermissions);

export default router;
