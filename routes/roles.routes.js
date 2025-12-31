import express from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import { orgCheck } from '../middlewares/org-check.middleware.js';
import * as rolesController from '../controllers/roles.controller.js';

const router = express.Router();

// Organization-scoped role routes
// POST /api/admin/organizations/:orgId/roles - Create role
router.post('/organizations/:orgId/roles', authenticate, orgCheck, rolesController.createRole);

// GET /api/admin/organizations/:orgId/roles - List organization roles
router.get('/organizations/:orgId/roles', authenticate, orgCheck, rolesController.getOrganizationRoles);

// Role-specific routes
// GET /api/admin/roles/:roleId - Get role with permissions
router.get('/roles/:roleId', authenticate, rolesController.getRole);

// PUT /api/admin/roles/:roleId - Update role
router.put('/roles/:roleId', authenticate, rolesController.updateRole);

// DELETE /api/admin/roles/:roleId - Delete role
router.delete('/roles/:roleId', authenticate, rolesController.deleteRole);

// Permission routes
// POST /api/admin/roles/:roleId/permissions - Grant permission(s)
router.post('/roles/:roleId/permissions', authenticate, rolesController.grantPermission);

// DELETE /api/admin/roles/:roleId/permissions/:featureSlug - Revoke permission
router.delete('/roles/:roleId/permissions/:featureSlug', authenticate, rolesController.revokePermission);

// GET /api/admin/roles/:roleId/permissions - Get role permissions
router.get('/roles/:roleId/permissions', authenticate, rolesController.getRolePermissions);

// User role assignment routes
// POST /api/admin/users/:userId/roles - Assign role to user
router.post('/users/:userId/roles', authenticate, rolesController.assignRoleToUser);

// DELETE /api/admin/users/:userId/roles/:roleId - Remove role from user
router.delete('/users/:userId/roles/:roleId', authenticate, rolesController.removeRoleFromUser);

// GET /api/admin/users/:userId/roles - Get user roles
router.get('/users/:userId/roles', authenticate, rolesController.getUserRoles);

export default router;
