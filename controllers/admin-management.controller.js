import asyncHandler from "../utilities/async-handler.js";
import {
  NotFoundError,
  ValidationError,
  ForbiddenError,
  ConflictError,
} from "../utilities/errors.js";
import usersService from "../services/users.service.js";
import organizationsService from "../services/organizations.service.js";
import rolesService from "../services/roles.service.js";
import userRolesService from "../services/user-roles.service.js";
import auditService from "../services/audit.service.js";
import logger from "../utilities/logger.js";
import {
  ADMIN_ROLE_SLUG,
  isUserAdmin,
} from "../middlewares/admin-check.middleware.js";

/**
 * GET /api/admin/organizations/:orgId/admins
 * List all admins in organization
 */
export const listOrganizationAdmins = asyncHandler(async (req, res) => {
  const orgId = parseInt(req.params.orgId, 10);
  const currentUser = req.dbUser; // From requireAdmin middleware

  if (isNaN(orgId)) {
    throw new ValidationError("Invalid organization ID");
  }

  // Get the admin role for this organization
  const adminRole = await rolesService.getRoleBySlug(ADMIN_ROLE_SLUG, orgId);

  // Get organization to include creator as admin
  const org = await organizationsService.getOrganization(orgId);
  if (!org) {
    throw new NotFoundError("Organization not found");
  }

  // Get all organization users
  const { users: orgUsers } = await organizationsService.getOrganizationUsers(
    orgId,
    1000,
    0
  );

  // Find admins: users with admin role OR the organization creator
  const admins = [];

  for (const user of orgUsers) {
    const isCreator = user.id === org.createdBy;
    let hasAdminRole = false;

    if (adminRole) {
      hasAdminRole = await isUserAdmin(user.id, orgId);
    }

    if (isCreator || hasAdminRole) {
      admins.push({
        id: user.id,
        clerkId: user.clerkId,
        email: user.email,
        isCreator,
        hasAdminRole,
        createdAt: user.createdAt,
      });
    }
  }

  logger.debug(
    { orgId, adminCount: admins.length },
    "Listed organization admins"
  );

  res.json({
    success: true,
    data: {
      admins,
      total: admins.length,
    },
  });
});

/**
 * POST /api/admin/organizations/:orgId/admins/:userId
 * Make a user an admin
 */
export const makeUserAdmin = asyncHandler(async (req, res) => {
  const orgId = parseInt(req.params.orgId, 10);
  const targetUserId = parseInt(req.params.userId, 10);
  const currentUser = req.dbUser;

  if (isNaN(orgId) || isNaN(targetUserId)) {
    throw new ValidationError("Invalid organization ID or user ID");
  }

  // Get target user
  const targetUser = await usersService.getUserById(targetUserId);
  if (!targetUser) {
    throw new NotFoundError("User not found");
  }

  // Verify target user belongs to organization
  const belongsToOrg = await organizationsService.userBelongsToOrganization(
    targetUserId,
    orgId
  );
  if (!belongsToOrg) {
    throw new ValidationError("User does not belong to this organization");
  }

  // Check if user is already an admin
  const isAlreadyAdmin = await isUserAdmin(targetUserId, orgId);
  if (isAlreadyAdmin) {
    throw new ConflictError("User is already an admin");
  }

  // Get or create admin role
  let adminRole = await rolesService.getRoleBySlug(ADMIN_ROLE_SLUG, orgId);

  if (!adminRole) {
    // Create admin role if it doesn't exist
    adminRole = await rolesService.createRole(
      orgId,
      "Admin",
      ADMIN_ROLE_SLUG,
      "Organization administrator with full access"
    );
    logger.info({ orgId, roleId: adminRole.id }, "Created admin role");
  }

  // Assign admin role to user
  await userRolesService.assignRoleToUser(targetUserId, adminRole.id, orgId);

  // Log admin action
  await auditService.logAdminAdded(currentUser, targetUser, orgId, {
    ip: req.ip,
  });

  logger.info(
    {
      orgId,
      targetUserId,
      assignedBy: currentUser.id,
    },
    "User made admin"
  );

  res.status(201).json({
    success: true,
    message: "User is now an admin",
    data: {
      userId: targetUserId,
      email: targetUser.email,
      isAdmin: true,
    },
  });
});

/**
 * DELETE /api/admin/organizations/:orgId/admins/:userId
 * Remove admin privileges from a user
 */
export const removeAdmin = asyncHandler(async (req, res) => {
  const orgId = parseInt(req.params.orgId, 10);
  const targetUserId = parseInt(req.params.userId, 10);
  const currentUser = req.dbUser;

  if (isNaN(orgId) || isNaN(targetUserId)) {
    throw new ValidationError("Invalid organization ID or user ID");
  }

  // Get organization
  const org = await organizationsService.getOrganization(orgId);
  if (!org) {
    throw new NotFoundError("Organization not found");
  }

  // Cannot remove creator's admin status
  if (org.createdBy === targetUserId) {
    throw new ForbiddenError(
      "Cannot remove admin status from organization creator"
    );
  }

  // Prevent removing yourself
  if (currentUser.id === targetUserId) {
    throw new ForbiddenError("Cannot remove your own admin status");
  }

  // Get target user
  const targetUser = await usersService.getUserById(targetUserId);
  if (!targetUser) {
    throw new NotFoundError("User not found");
  }

  // Check if user has admin role
  const hasAdminRole = await isUserAdmin(targetUserId, orgId);
  if (!hasAdminRole) {
    throw new ValidationError("User is not an admin");
  }

  // Get admin role
  const adminRole = await rolesService.getRoleBySlug(ADMIN_ROLE_SLUG, orgId);
  if (!adminRole) {
    throw new NotFoundError("Admin role not found");
  }

  // Count remaining admins (excluding creator who is always admin)
  const { users: orgUsers } = await organizationsService.getOrganizationUsers(
    orgId,
    1000,
    0
  );
  let adminCount = 0;

  for (const user of orgUsers) {
    if (user.id === org.createdBy) {
      adminCount++; // Creator always counts
    } else if (user.id !== targetUserId) {
      const isAdmin = await isUserAdmin(user.id, orgId);
      if (isAdmin) adminCount++;
    }
  }

  // Ensure at least one admin remains
  if (adminCount === 0) {
    throw new ForbiddenError(
      "Cannot remove the last admin. At least one admin must remain."
    );
  }

  // Remove admin role from user
  await userRolesService.removeRoleFromUser(targetUserId, adminRole.id, orgId);

  // Log admin action
  await auditService.logAdminRemoved(currentUser, targetUser, orgId, {
    ip: req.ip,
  });

  logger.info(
    {
      orgId,
      targetUserId,
      removedBy: currentUser.id,
    },
    "Admin privileges removed"
  );

  res.status(200).json({
    success: true,
    message: "Admin privileges removed",
    data: {
      userId: targetUserId,
      email: targetUser.email,
      isAdmin: false,
    },
  });
});

/**
 * GET /api/admin/organizations/:orgId/audit-log
 * Get audit log for organization
 */
export const getAuditLog = asyncHandler(async (req, res) => {
  const orgId = parseInt(req.params.orgId, 10);
  const limit = parseInt(req.query.limit, 10) || 50;
  const offset = parseInt(req.query.offset, 10) || 0;
  const action = req.query.action;
  const userId = req.query.userId ? parseInt(req.query.userId, 10) : undefined;

  if (isNaN(orgId)) {
    throw new ValidationError("Invalid organization ID");
  }

  const result = await auditService.getAuditLogs({
    organizationId: orgId,
    action,
    userId,
    limit,
    offset,
  });

  res.json({
    success: true,
    data: result.logs,
    pagination: {
      total: result.total,
      limit: result.limit,
      offset: result.offset,
      hasMore: result.hasMore,
    },
  });
});

/**
 * GET /api/admin/organizations/:orgId/members
 * List all members with their admin status
 */
export const listOrganizationMembers = asyncHandler(async (req, res) => {
  const orgId = parseInt(req.params.orgId, 10);
  const limit = parseInt(req.query.limit, 10) || 50;
  const offset = parseInt(req.query.offset, 10) || 0;

  if (isNaN(orgId)) {
    throw new ValidationError("Invalid organization ID");
  }

  const org = await organizationsService.getOrganization(orgId);
  if (!org) {
    throw new NotFoundError("Organization not found");
  }

  const { users, total } = await organizationsService.getOrganizationUsers(
    orgId,
    limit,
    offset
  );

  // Enrich with admin status
  const enrichedUsers = await Promise.all(
    users.map(async (user) => {
      const isCreator = user.id === org.createdBy;
      const hasAdminRole = await isUserAdmin(user.id, orgId);

      return {
        ...user,
        isAdmin: isCreator || hasAdminRole,
        isCreator,
      };
    })
  );

  res.json({
    success: true,
    data: enrichedUsers,
    pagination: {
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    },
  });
});
