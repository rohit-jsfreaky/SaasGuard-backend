import express from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import * as usersController from '../controllers/users.controller.js';

const router = express.Router();

/**
 * Organization User Routes
 * GET /api/organizations/:orgId/users - List users in organization
 */
router.get('/:orgId/users', authenticate, usersController.getUsersByOrganization);

export default router;
