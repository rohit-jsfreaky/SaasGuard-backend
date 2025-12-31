import asyncHandler from '../utilities/async-handler.js';
import { NotFoundError, ValidationError, ConflictError, ForbiddenError } from '../utilities/errors.js';
import rolesService from '../services/roles.service.js';
import rolePermissionsService from '../services/role-permissions.service.js';
import userRolesService from '../services/user-roles.service.js';
import usersService from '../services/users.service.js';
import organizationsService from '../services/organizations.service.js';
import logger from '../utilities/logger.js';
import { validateRoleName, validateRoleSlug, slugifyRoleName } from '../utilities/validators.js';

/**
 * POST /api/admin/organizations/:orgId/roles
 * Create new role
 */
export const createRole = asyncHandler(async (req, res) => {
  const orgId = parseInt(req.params.orgId, 10);
  const { name, slug, description } = req.body;
  const currentUserId = req.userId; // Clerk ID

  if (isNaN(orgId)) {
    throw new ValidationError('Invalid organization ID');
  }

  // Verify user belongs to organization
  const currentUser = await usersService.getUserByClerkId(currentUserId);
  if (!currentUser) {
    throw new NotFoundError('Current user not found. Please sync your account first.');
  }

  const belongsToOrg = await organizationsService.userBelongsToOrganization(currentUser.id, orgId);
  if (!belongsToOrg) {
    throw new ForbiddenError('You do not have access to this organization');
  }

  // Validate inputs
  const nameError = validateRoleName(name);
  if (nameError) {
    throw new ValidationError(nameError);
  }

  // Use provided slug or generate from name
  const roleSlug = slug || slugifyRoleName(name);
  const slugError = validateRoleSlug(roleSlug);
  if (slugError) {
    throw new ValidationError(slugError);
  }

  // Create role
  const role = await rolesService.createRole(orgId, name, roleSlug, description);

  res.status(201).json({
    success: true,
    data: role
  });
});

/**
 * GET /api/admin/organizations/:orgId/roles
 * List all roles for organization
 */
export const getOrganizationRoles = asyncHandler(async (req, res) => {
  const orgId = parseInt(req.params.orgId, 10);
  const limit = parseInt(req.query.limit || '50', 10);
  const offset = parseInt(req.query.offset || '0', 10);
  const currentUserId = req.userId; // Clerk ID

  if (isNaN(orgId)) {
    throw new ValidationError('Invalid organization ID');
  }

  // Verify user belongs to organization
  const currentUser = await usersService.getUserByClerkId(currentUserId);
  if (!currentUser) {
    throw new NotFoundError('Current user not found. Please sync your account first.');
  }

  const belongsToOrg = await organizationsService.userBelongsToOrganization(currentUser.id, orgId);
  if (!belongsToOrg) {
    throw new ForbiddenError('You do not have access to this organization');
  }

  // Get roles
  const result = await rolesService.getRolesByOrganization(orgId, limit, offset);

  res.json({
    success: true,
    data: result.roles,
    pagination: {
      total: result.total,
      limit: result.limit,
      offset: result.offset,
      hasMore: result.hasMore
    }
  });
});

/**
 * GET /api/admin/roles/:roleId
 * Get role with permissions
 */
export const getRole = asyncHandler(async (req, res) => {
  const roleId = parseInt(req.params.roleId, 10);
  const currentUserId = req.userId; // Clerk ID

  if (isNaN(roleId)) {
    throw new ValidationError('Invalid role ID');
  }

  // Get role
  const role = await rolesService.getRole(roleId);
  if (!role) {
    throw new NotFoundError('Role not found');
  }

  // Verify user belongs to role's organization
  const currentUser = await usersService.getUserByClerkId(currentUserId);
  if (!currentUser) {
    throw new NotFoundError('Current user not found. Please sync your account first.');
  }

  const belongsToOrg = await organizationsService.userBelongsToOrganization(currentUser.id, role.organizationId);
  if (!belongsToOrg) {
    throw new ForbiddenError('You do not have access to this role');
  }

  // Get role with permissions
  const roleWithPermissions = await rolesService.getRoleWithPermissions(roleId);

  res.json({
    success: true,
    data: roleWithPermissions
  });
});

/**
 * PUT /api/admin/roles/:roleId
 * Update role
 */
export const updateRole = asyncHandler(async (req, res) => {
  const roleId = parseInt(req.params.roleId, 10);
  const { name, description } = req.body;
  const currentUserId = req.userId; // Clerk ID

  if (isNaN(roleId)) {
    throw new ValidationError('Invalid role ID');
  }

  // Get role
  const role = await rolesService.getRole(roleId);
  if (!role) {
    throw new NotFoundError('Role not found');
  }

  // Verify user belongs to role's organization
  const currentUser = await usersService.getUserByClerkId(currentUserId);
  if (!currentUser) {
    throw new NotFoundError('Current user not found. Please sync your account first.');
  }

  const belongsToOrg = await organizationsService.userBelongsToOrganization(currentUser.id, role.organizationId);
  if (!belongsToOrg) {
    throw new ForbiddenError('You do not have access to this role');
  }

  // Validate name if provided
  if (name !== undefined) {
    const nameError = validateRoleName(name);
    if (nameError) {
      throw new ValidationError(nameError);
    }
  }

  // Update role
  const updates = {};
  if (name !== undefined) updates.name = name;
  if (description !== undefined) updates.description = description;

  const updatedRole = await rolesService.updateRole(roleId, updates);

  res.json({
    success: true,
    data: updatedRole
  });
});

/**
 * DELETE /api/admin/roles/:roleId
 * Delete role
 */
export const deleteRole = asyncHandler(async (req, res) => {
  const roleId = parseInt(req.params.roleId, 10);
  const currentUserId = req.userId; // Clerk ID

  if (isNaN(roleId)) {
    throw new ValidationError('Invalid role ID');
  }

  // Get role
  const role = await rolesService.getRole(roleId);
  if (!role) {
    throw new NotFoundError('Role not found');
  }

  // Verify user belongs to role's organization
  const currentUser = await usersService.getUserByClerkId(currentUserId);
  if (!currentUser) {
    throw new NotFoundError('Current user not found. Please sync your account first.');
  }

  const belongsToOrg = await organizationsService.userBelongsToOrganization(currentUser.id, role.organizationId);
  if (!belongsToOrg) {
    throw new ForbiddenError('You do not have access to this role');
  }

  // Delete role (will check for user assignments)
  await rolesService.deleteRole(roleId);

  res.status(204).send();
});

/**
 * POST /api/admin/roles/:roleId/permissions
 * Grant permission(s) to role
 */
export const grantPermission = asyncHandler(async (req, res) => {
  const roleId = parseInt(req.params.roleId, 10);
  const { featureSlug, featureSlugs } = req.body;
  const currentUserId = req.userId; // Clerk ID

  if (isNaN(roleId)) {
    throw new ValidationError('Invalid role ID');
  }

  // Get role
  const role = await rolesService.getRole(roleId);
  if (!role) {
    throw new NotFoundError('Role not found');
  }

  // Verify user belongs to role's organization
  const currentUser = await usersService.getUserByClerkId(currentUserId);
  if (!currentUser) {
    throw new NotFoundError('Current user not found. Please sync your account first.');
  }

  const belongsToOrg = await organizationsService.userBelongsToOrganization(currentUser.id, role.organizationId);
  if (!belongsToOrg) {
    throw new ForbiddenError('You do not have access to this role');
  }

  // Grant permission(s)
  if (featureSlugs && Array.isArray(featureSlugs)) {
    // Bulk grant
    await rolePermissionsService.grantMultiplePermissions(roleId, featureSlugs);
  } else if (featureSlug) {
    // Single grant
    await rolePermissionsService.grantPermissionToRole(roleId, featureSlug);
  } else {
    throw new ValidationError('Either featureSlug or featureSlugs array is required');
  }

  res.status(201).json({
    success: true,
    message: 'Permission(s) granted successfully'
  });
});

/**
 * DELETE /api/admin/roles/:roleId/permissions/:featureSlug
 * Revoke permission from role
 */
export const revokePermission = asyncHandler(async (req, res) => {
  const roleId = parseInt(req.params.roleId, 10);
  const { featureSlug } = req.params;
  const currentUserId = req.userId; // Clerk ID

  if (isNaN(roleId)) {
    throw new ValidationError('Invalid role ID');
  }

  if (!featureSlug) {
    throw new ValidationError('Feature slug is required');
  }

  // Get role
  const role = await rolesService.getRole(roleId);
  if (!role) {
    throw new NotFoundError('Role not found');
  }

  // Verify user belongs to role's organization
  const currentUser = await usersService.getUserByClerkId(currentUserId);
  if (!currentUser) {
    throw new NotFoundError('Current user not found. Please sync your account first.');
  }

  const belongsToOrg = await organizationsService.userBelongsToOrganization(currentUser.id, role.organizationId);
  if (!belongsToOrg) {
    throw new ForbiddenError('You do not have access to this role');
  }

  // Revoke permission
  await rolePermissionsService.revokePermissionFromRole(roleId, featureSlug);

  res.status(204).send();
});

/**
 * GET /api/admin/roles/:roleId/permissions
 * Get all permissions for role
 */
export const getRolePermissions = asyncHandler(async (req, res) => {
  const roleId = parseInt(req.params.roleId, 10);
  const currentUserId = req.userId; // Clerk ID

  if (isNaN(roleId)) {
    throw new ValidationError('Invalid role ID');
  }

  // Get role
  const role = await rolesService.getRole(roleId);
  if (!role) {
    throw new NotFoundError('Role not found');
  }

  // Verify user belongs to role's organization
  const currentUser = await usersService.getUserByClerkId(currentUserId);
  if (!currentUser) {
    throw new NotFoundError('Current user not found. Please sync your account first.');
  }

  const belongsToOrg = await organizationsService.userBelongsToOrganization(currentUser.id, role.organizationId);
  if (!belongsToOrg) {
    throw new ForbiddenError('You do not have access to this role');
  }

  // Get permissions
  const permissions = await rolePermissionsService.getRolePermissions(roleId);

  res.json({
    success: true,
    data: permissions
  });
});

/**
 * POST /api/admin/users/:userId/roles
 * Assign role to user
 */
export const assignRoleToUser = asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  const { roleId, organizationId } = req.body;
  const currentUserId = req.userId; // Clerk ID

  if (isNaN(userId)) {
    throw new ValidationError('Invalid user ID');
  }

  if (!roleId) {
    throw new ValidationError('Role ID is required');
  }

  if (!organizationId) {
    throw new ValidationError('Organization ID is required');
  }

  // Verify current user belongs to organization
  const currentUser = await usersService.getUserByClerkId(currentUserId);
  if (!currentUser) {
    throw new NotFoundError('Current user not found. Please sync your account first.');
  }

  const belongsToOrg = await organizationsService.userBelongsToOrganization(currentUser.id, organizationId);
  if (!belongsToOrg) {
    throw new ForbiddenError('You do not have access to this organization');
  }

  // Assign role
  await userRolesService.assignRoleToUser(userId, roleId, organizationId);

  res.status(201).json({
    success: true,
    message: 'Role assigned successfully'
  });
});

/**
 * DELETE /api/admin/users/:userId/roles/:roleId
 * Remove role from user
 */
export const removeRoleFromUser = asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  const roleId = parseInt(req.params.roleId, 10);
  const organizationId = parseInt(req.query.organizationId, 10);
  const currentUserId = req.userId; // Clerk ID

  if (isNaN(userId)) {
    throw new ValidationError('Invalid user ID');
  }

  if (isNaN(roleId)) {
    throw new ValidationError('Invalid role ID');
  }

  if (isNaN(organizationId)) {
    throw new ValidationError('Organization ID is required');
  }

  // Verify current user belongs to organization
  const currentUser = await usersService.getUserByClerkId(currentUserId);
  if (!currentUser) {
    throw new NotFoundError('Current user not found. Please sync your account first.');
  }

  const belongsToOrg = await organizationsService.userBelongsToOrganization(currentUser.id, organizationId);
  if (!belongsToOrg) {
    throw new ForbiddenError('You do not have access to this organization');
  }

  // Remove role
  await userRolesService.removeRoleFromUser(userId, roleId, organizationId);

  res.status(204).send();
});

/**
 * GET /api/admin/users/:userId/roles
 * Get user roles
 */
export const getUserRoles = asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  const organizationId = parseInt(req.query.organizationId, 10);
  const currentUserId = req.userId; // Clerk ID

  if (isNaN(userId)) {
    throw new ValidationError('Invalid user ID');
  }

  if (isNaN(organizationId)) {
    throw new ValidationError('Organization ID is required');
  }

  // Verify current user belongs to organization
  const currentUser = await usersService.getUserByClerkId(currentUserId);
  if (!currentUser) {
    throw new NotFoundError('Current user not found. Please sync your account first.');
  }

  const belongsToOrg = await organizationsService.userBelongsToOrganization(currentUser.id, organizationId);
  if (!belongsToOrg) {
    throw new ForbiddenError('You do not have access to this organization');
  }

  // Check authorization: admin or self
  const isSelf = currentUser.id === userId;
  if (!isSelf) {
    // TODO: Check if current user is admin in organization
    // For now, allow if user belongs to org
  }

  // Get user roles with permissions
  const roles = await userRolesService.getUserRoles(userId, organizationId);
  
  // Get permissions for each role
  const rolesWithPermissions = await Promise.all(
    roles.map(async (role) => {
      const permissions = await rolePermissionsService.getRolePermissions(role.id);
      return {
        ...role,
        permissions
      };
    })
  );

  res.json({
    success: true,
    data: rolesWithPermissions
  });
});
