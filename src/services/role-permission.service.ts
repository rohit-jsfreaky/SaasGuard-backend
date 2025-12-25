import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { rolePermissions } from "../db/schema.js";
import type { RolePermission, NewRolePermission } from "../types/db.js";
import { cacheService, CacheTTL } from "./cache.service.js";
import { rolePermissionsKey } from "../utils/cache-keys.js";
import { isDevelopment } from "../config/environment.js";

/**
 * Role Permission Service
 * Manages the association between roles and feature permissions
 */
class RolePermissionService {
  /**
   * Grant a permission to a role
   * @param roleId - Role ID
   * @param featureSlug - Feature slug
   */
  async grantPermissionToRole(
    roleId: number,
    featureSlug: string
  ): Promise<RolePermission> {
    // Check if already exists
    const existing = await db
      .select()
      .from(rolePermissions)
      .where(
        and(
          eq(rolePermissions.roleId, roleId),
          eq(rolePermissions.featureSlug, featureSlug)
        )
      )
      .limit(1);

    if (existing[0]) {
      // Already granted, return existing
      return existing[0];
    }

    // Grant new permission
    const newPermission: NewRolePermission = {
      roleId,
      featureSlug,
    };

    const created = await db
      .insert(rolePermissions)
      .values(newPermission)
      .returning();

    const result = created[0];
    if (!result) {
      throw new Error("Failed to grant permission");
    }

    await this.invalidateCache(roleId);

    if (isDevelopment) {
      console.log(
        `[RolePermissionService] Granted ${featureSlug} to role ${roleId}`
      );
    }

    return result;
  }

  /**
   * Revoke a permission from a role
   * @param roleId - Role ID
   * @param featureSlug - Feature slug
   */
  async revokePermissionFromRole(
    roleId: number,
    featureSlug: string
  ): Promise<void> {
    const result = await db
      .delete(rolePermissions)
      .where(
        and(
          eq(rolePermissions.roleId, roleId),
          eq(rolePermissions.featureSlug, featureSlug)
        )
      )
      .returning({ id: rolePermissions.id });

    if (result.length === 0) {
      throw new Error(`Permission ${featureSlug} not found for role ${roleId}`);
    }

    await this.invalidateCache(roleId);

    if (isDevelopment) {
      console.log(
        `[RolePermissionService] Revoked ${featureSlug} from role ${roleId}`
      );
    }
  }

  /**
   * Get all permissions for a role
   * @param roleId - Role ID
   * @returns List of role permissions
   */
  async getRolePermissions(roleId: number): Promise<RolePermission[]> {
    // Try cache first
    const cacheKey = rolePermissionsKey(roleId);
    const cached = await cacheService.get<RolePermission[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const result = await db
      .select()
      .from(rolePermissions)
      .where(eq(rolePermissions.roleId, roleId))
      .orderBy(rolePermissions.featureSlug);

    // Cache the result
    await cacheService.set(cacheKey, result, CacheTTL.PERMISSIONS);

    return result;
  }

  /**
   * Get permission slugs for a role
   * @param roleId - Role ID
   * @returns Set of feature slugs
   */
  async getRolePermissionSlugs(roleId: number): Promise<Set<string>> {
    const permissions = await this.getRolePermissions(roleId);
    return new Set(permissions.map((p) => p.featureSlug));
  }

  /**
   * Check if a role has a specific permission
   * @param roleId - Role ID
   * @param featureSlug - Feature slug
   * @returns True if role has the permission
   */
  async hasRolePermission(
    roleId: number,
    featureSlug: string
  ): Promise<boolean> {
    const slugs = await this.getRolePermissionSlugs(roleId);
    return slugs.has(featureSlug);
  }

  /**
   * Set multiple permissions for a role (replace all)
   * @param roleId - Role ID
   * @param featureSlugs - Array of feature slugs
   */
  async setRolePermissions(
    roleId: number,
    featureSlugs: string[]
  ): Promise<void> {
    // Delete all existing permissions
    await db.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));

    // Insert new permissions
    if (featureSlugs.length > 0) {
      const newPermissions: NewRolePermission[] = featureSlugs.map((slug) => ({
        roleId,
        featureSlug: slug,
      }));

      await db.insert(rolePermissions).values(newPermissions);
    }

    await this.invalidateCache(roleId);

    if (isDevelopment) {
      console.log(
        `[RolePermissionService] Set ${featureSlugs.length} permissions for role ${roleId}`
      );
    }
  }

  /**
   * Invalidate cache for a role's permissions
   */
  private async invalidateCache(roleId: number): Promise<void> {
    await cacheService.del(rolePermissionsKey(roleId));
  }
}

/**
 * Singleton role permission service instance
 */
export const rolePermissionService = new RolePermissionService();
