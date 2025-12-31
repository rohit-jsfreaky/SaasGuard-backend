import express from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import * as usersController from '../controllers/users.controller.js';
import * as userPlansController from '../controllers/user-plans.controller.js';

const router = express.Router();

/**
 * User Management Routes
 * All routes require authentication
 */

// POST /api/users/sync - Sync user from Clerk
router.post('/sync', authenticate, usersController.syncUser);

// GET /api/users/me - Get current user
router.get('/me', authenticate, usersController.getCurrentUser);

// GET /api/users/:userId/plan - Get user's plan (must be before /:userId route)
router.get('/:userId/plan', authenticate, userPlansController.getUserPlan);

// GET /api/users/:userId - Get user by ID
router.get('/:userId', authenticate, usersController.getUserById);

// PUT /api/users/:userId - Update user
router.put('/:userId', authenticate, usersController.updateUser);

// DELETE /api/users/:userId - Delete user
router.delete('/:userId', authenticate, usersController.deleteUser);

export default router;
