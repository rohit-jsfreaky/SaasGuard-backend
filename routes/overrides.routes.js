import express from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import { orgCheck } from '../middlewares/org-check.middleware.js';
import * as overridesController from '../controllers/overrides.controller.js';

const router = express.Router();

// Organization-scoped override routes (must be before other routes to avoid conflicts)
// POST /api/admin/organizations/:orgId/overrides - Create org override
router.post('/organizations/:orgId/overrides', authenticate, orgCheck, overridesController.createOrganizationOverride);

// GET /api/admin/organizations/:orgId/overrides - List org overrides
router.get('/organizations/:orgId/overrides', authenticate, orgCheck, overridesController.getOrganizationOverrides);

// PUT /api/admin/organizations/:orgId/overrides/:overrideId - Update org override
router.put('/organizations/:orgId/overrides/:overrideId', authenticate, orgCheck, overridesController.updateOrganizationOverride);

// DELETE /api/admin/organizations/:orgId/overrides/:overrideId - Delete org override
router.delete('/organizations/:orgId/overrides/:overrideId', authenticate, orgCheck, overridesController.deleteOrganizationOverride);

// Admin cleanup route (must be before /:overrideId route)
// POST /api/admin/overrides/cleanup-expired - Cleanup expired overrides
router.post('/overrides/cleanup-expired', authenticate, overridesController.cleanupExpiredOverrides);

// User override routes
// POST /api/admin/overrides - Create user override
router.post('/overrides', authenticate, overridesController.createUserOverride);

// GET /api/admin/overrides - List all overrides (with filtering)
router.get('/overrides', authenticate, overridesController.getAllOverrides);

// GET /api/admin/users/:userId/overrides - List user overrides
router.get('/users/:userId/overrides', authenticate, overridesController.getUserOverrides);

// GET /api/admin/overrides/:overrideId - Get override
router.get('/overrides/:overrideId', authenticate, overridesController.getOverride);

// PUT /api/admin/overrides/:overrideId - Update override
router.put('/overrides/:overrideId', authenticate, overridesController.updateOverride);

// DELETE /api/admin/overrides/:overrideId - Delete override
router.delete('/overrides/:overrideId', authenticate, overridesController.deleteOverride);

export default router;
