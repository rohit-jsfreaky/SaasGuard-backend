import express from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import { orgCheck } from '../middlewares/org-check.middleware.js';
import * as organizationsController from '../controllers/organizations.controller.js';
import * as usersController from '../controllers/users.controller.js';
import * as dashboardController from '../controllers/dashboard.controller.js';

const router = express.Router();

/**
 * Organization Management Routes
 * All routes require authentication
 */

// POST /api/organizations - Create organization
router.post('/', authenticate, organizationsController.createOrganization);

// GET /api/organizations - List user's organizations
router.get('/', authenticate, organizationsController.getUserOrganizations);

// GET /api/organizations/:orgId - Get organization
router.get('/:orgId', authenticate, organizationsController.getOrganization);

// PUT /api/organizations/:orgId - Update organization
router.put('/:orgId', authenticate, organizationsController.updateOrganization);

// DELETE /api/organizations/:orgId - Delete organization
router.delete('/:orgId', authenticate, organizationsController.deleteOrganization);

// GET /api/organizations/:orgId/members - List organization members
router.get('/:orgId/members', authenticate, organizationsController.getOrganizationMembers);

// POST /api/organizations/:orgId/members/:userId - Add user to organization
router.post('/:orgId/members/:userId', authenticate, organizationsController.addMemberToOrganization);

// DELETE /api/organizations/:orgId/members/:userId - Remove user from organization
router.delete('/:orgId/members/:userId', authenticate, organizationsController.removeMemberFromOrganization);

// GET /api/organizations/:orgId/users - List users in organization (alias, uses users controller)
router.get('/:orgId/users', authenticate, usersController.getUsersByOrganization);

export default router;

