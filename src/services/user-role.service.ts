import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { userRoles, roles } from "../db/schema.js";
import type { UserRole, NewUserRole, Role } from "../types/db.js";
import { cacheService, CacheTTL } from "./cache.service.js";
import { userRolesKey, userPermissionsKey } from "../utils/cache-keys.js";
import { rolePermissionService } from "./role-permission.service.js";
import { isDevelopment } from "../config/environment.js";

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
    userId: number,
    roleId: number,
    orgId: number
  ): Promise<UserRole> {
    // Check if already assigned
    const existing = await db
      .select()
      .from(userRoles)
      .where(
        and(
          eq(userRoles.userId, userId),
          eq(userRoles.roleId, roleId),
          eq(userRoles.organizationId, orgId)
        )
      )
      .limit(1);

    if (existing[0]) {
      // Already assigned
      return existing[0];
    }

    // Assign role
    const newUserRole: NewUserRole = {
      userId,
      roleId,
      organizationId: orgId,
    };

    const created = await db.insert(userRoles).values(newUserRole).returning();

    const result = created[0];
    if (!result) {
      throw new Error("Failed to assign role to user");
    }

    await this.invalidateCache(userId, orgId);

    if (isDevelopment) {
      console.log(
        `[UserRoleService] Assigned role ${roleId} to user ${userId} in org ${orgId}`
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
    userId: number,
    roleId: number,
    orgId: number
  ): Promise<void> {
    const result = await db
      .delete(userRoles)
      .where(
        and(
          eq(userRoles.userId, userId),
          eq(userRoles.roleId, roleId),
          eq(userRoles.organizationId, orgId)
        )
      )
      .returning({ id: userRoles.id });

    if (result.length === 0) {
      throw new Error(
        `Role ${roleId} not assigned to user ${userId} in org ${orgId}`
      );
    }

    await this.invalidateCache(userId, orgId);

    if (isDevelopment) {
      console.log(
        `[UserRoleService] Removed role ${roleId} from user ${userId} in org ${orgId}`
      );
    }
  }

  /**
   * Get all roles assigned to a user in an organization
   * @param userId - User ID
   * @param orgId - Organization ID
   * @returns List of roles
   */
  async getUserRoles(userId: number, orgId: number): Promise<Role[]> {
    // Try cache first
    const cacheKey = userRolesKey(userId, orgId);
    const cached = await cacheService.get<Role[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const result = await db
      .select({ role: roles })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(
        and(eq(userRoles.userId, userId), eq(userRoles.organizationId, orgId))
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
    userId: number,
    orgId: number
  ): Promise<string[]> {
    // Try cache first
    const cacheKey = userPermissionsKey(userId, orgId);
    const cached = await cacheService.get<string[]>(cacheKey);
    if (cached) {
      return cached;
    }

    // Get all user's roles
    const userRolesList = await this.getUserRoles(userId, orgId);

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
    userId: number,
    orgId: number,
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
    userId: number,
    orgId: number
  ): Promise<UserRole[]> {
    const result = await db
      .select()
      .from(userRoles)
      .where(
        and(eq(userRoles.userId, userId), eq(userRoles.organizationId, orgId))
      );

    return result;
  }

  /**
   * Invalidate cache for a user's roles and permissions
   */
  private async invalidateCache(userId: number, orgId: number): Promise<void> {
    await cacheService.del([
      userRolesKey(userId, orgId),
      userPermissionsKey(userId, orgId),
    ]);
  }
}

/**
 * Singleton user role service instance
 */
export const userRoleService = new UserRoleService();
