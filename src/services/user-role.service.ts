import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { userRoles, roles } from "../db/schema.js";
import type { UserRole, NewUserRole, Role } from "../types/db.js";
import { cacheService, CacheTTL } from "./cache.service.js";
import { userRolesKey, userPermissionsKey } from "../utils/cache-keys.js";
import { rolePermissionService } from "./role-permission.service.js";
import { isDevelopment } from "../config/environment.js";
import { organizationService } from "./organization.service.js";

/**
 * User Role Service
 * Manages role assignments to users
 */
class UserRoleService {
  /**
   * Assign a role to a user
   * @param userId - User ID
   * @param roleId - Role ID
   * @param orgId - Organization ID
   */
  async assignRoleToUser(
    userId: string,
    roleId: number,
    orgId: number | string
  ): Promise<UserRole> {
    const resolvedUserId = userId;
    const resolvedOrgId = await this.resolveOrganizationId(orgId);

    // Check if already assigned
    const existing = await db
      .select()
      .from(userRoles)
      .where(
        and(
          eq(userRoles.userId, resolvedUserId),
          eq(userRoles.roleId, roleId),
          eq(userRoles.organizationId, resolvedOrgId)
        )
      )
      .limit(1);

    if (existing[0]) {
      // Already assigned
      return existing[0];
    }

    // Assign role
    const newUserRole: NewUserRole = {
      userId: resolvedUserId,
      roleId,
      organizationId: resolvedOrgId,
    };

    const created = await db.insert(userRoles).values(newUserRole).returning();

    const result = created[0];
    if (!result) {
      throw new Error("Failed to assign role to user");
    }

    await this.invalidateCache(resolvedUserId, resolvedOrgId);

    if (isDevelopment) {
      console.log(
        `[UserRoleService] Assigned role ${roleId} to user ${resolvedUserId} in org ${resolvedOrgId}`
      );
    }

    return result;
  }

  /**
   * Remove a role from a user
   * @param userId - User ID
   * @param roleId - Role ID
   * @param orgId - Organization ID
   */
  async removeRoleFromUser(
    userId: string,
    roleId: number,
    orgId: number | string
  ): Promise<void> {
    const resolvedUserId = userId;
    const resolvedOrgId = await this.resolveOrganizationId(orgId);

    const result = await db
      .delete(userRoles)
      .where(
        and(
          eq(userRoles.userId, resolvedUserId),
          eq(userRoles.roleId, roleId),
          eq(userRoles.organizationId, resolvedOrgId)
        )
      )
      .returning({ id: userRoles.id });

    if (result.length === 0) {
      throw new Error(
        `Role ${roleId} not assigned to user ${resolvedUserId} in org ${resolvedOrgId}`
      );
    }

    await this.invalidateCache(resolvedUserId, resolvedOrgId);

    if (isDevelopment) {
      console.log(
        `[UserRoleService] Removed role ${roleId} from user ${resolvedUserId} in org ${resolvedOrgId}`
      );
    }
  }

  /**
   * Get all roles assigned to a user in an organization
   * @param userId - User ID
   * @param orgId - Organization ID
   * @returns List of roles
   */
  async getUserRoles(
    userId: string,
    orgId: number | string
  ): Promise<Role[]> {
    const resolvedUserId = userId;
    const resolvedOrgId = await this.resolveOrganizationId(orgId);

    // Try cache first
    const cacheKey = userRolesKey(resolvedUserId, resolvedOrgId);
    const cached = await cacheService.get<Role[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const result = await db
      .select({ role: roles })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(
        and(
          eq(userRoles.userId, resolvedUserId),
          eq(userRoles.organizationId, resolvedOrgId)
        )
      )
      .orderBy(roles.name);

    const roleList = result.map((r) => r.role);

    // Cache the result
    await cacheService.set(cacheKey, roleList, CacheTTL.ROLES);

    return roleList;
  }

  /**
   * Get all permissions for a user through their roles
   * @param userId - User ID
   * @param orgId - Organization ID
   * @returns Array of feature slugs
   */
  async getUserRolePermissions(
    userId: string,
    orgId: number | string
  ): Promise<string[]> {
    const resolvedUserId = userId;
    const resolvedOrgId = await this.resolveOrganizationId(orgId);

    // Try cache first
    const cacheKey = userPermissionsKey(resolvedUserId, resolvedOrgId);
    const cached = await cacheService.get<string[]>(cacheKey);
    if (cached) {
      return cached;
    }

    // Get all user's roles
    const userRolesList = await this.getUserRoles(resolvedUserId, resolvedOrgId);

    // Aggregate permissions from all roles
    const permissionSet = new Set<string>();

    for (const role of userRolesList) {
      const slugs = await rolePermissionService.getRolePermissionSlugs(role.id);
      for (const slug of slugs) {
        permissionSet.add(slug);
      }
    }

    const permissions = Array.from(permissionSet).sort();

    // Cache the result
    await cacheService.set(cacheKey, permissions, CacheTTL.PERMISSIONS);

    return permissions;
  }

  /**
   * Check if a user has a specific permission through their roles
   * @param userId - User ID
   * @param orgId - Organization ID
   * @param featureSlug - Feature slug
   * @returns True if user has the permission
   */
  async hasPermission(
    userId: string,
    orgId: number | string,
    featureSlug: string
  ): Promise<boolean> {
    const permissions = await this.getUserRolePermissions(userId, orgId);
    return permissions.includes(featureSlug);
  }

  /**
   * Get user role assignments (without joining roles table)
   * @param userId - User ID
   * @param orgId - Organization ID
   * @returns List of user role assignments
   */
  async getUserRoleAssignments(
    userId: string,
    orgId: number | string
  ): Promise<UserRole[]> {
    const resolvedUserId = userId;
    const resolvedOrgId = await this.resolveOrganizationId(orgId);

    const result = await db
      .select()
      .from(userRoles)
      .where(
        and(
          eq(userRoles.userId, resolvedUserId),
          eq(userRoles.organizationId, resolvedOrgId)
        )
      );

    return result;
  }

  /**
   * Invalidate cache for a user's roles and permissions
   */
  private async invalidateCache(
    userId: string,
    orgId: number
  ): Promise<void> {
    await cacheService.del([
      userRolesKey(userId, orgId),
      userPermissionsKey(userId, orgId),
    ]);
  }

  /**
   * Resolve internal organization ID from Clerk or numeric input
   */
  private async resolveOrganizationId(
    orgId: number | string
  ): Promise<number> {
    if (typeof orgId === "number") {
      return orgId;
    }

    const parsed = Number(orgId);
    if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
      return parsed;
    }

    const organization = await organizationService.getOrganizationByClerkId(
      orgId
    );
    if (!organization) {
      throw new Error(`Organization not found for ID ${orgId}`);
    }

    return organization.id;
  }
}

/**
 * Singleton user role service instance
 */
export const userRoleService = new UserRoleService();
