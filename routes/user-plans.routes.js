import express from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import * as userPlansController from '../controllers/user-plans.controller.js';

const router = express.Router();

// User plan routes (admin only)
// POST /api/admin/users/:userId/plan - Assign plan to user
router.post('/users/:userId/plan', authenticate, userPlansController.assignPlanToUser);

// DELETE /api/admin/users/:userId/plan - Remove plan from user
router.delete('/users/:userId/plan', authenticate, userPlansController.removePlanFromUser);

export default router;

