import { eq, and, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { roles, userRoles } from "../db/schema.js";
import type { Role, NewRole, RoleUpdate } from "../types/db.js";
import { cacheService, CacheTTL } from "./cache.service.js";
import { roleKey, orgRolesKey } from "../utils/cache-keys.js";
import { isDevelopment } from "../config/environment.js";

/**
 * Pagination options
 */
export interface PaginationOptions {
  limit?: number;
  offset?: number;
}

/**
 * Role list result with pagination metadata
 */
export interface RoleListResult {
  roles: Role[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Role Service
 * Manages roles which define access permissions
 */
class RoleService {
  /**
   * Create a new role
   * @param orgId - Organization ID
   * @param name - Role display name
   * @param slug - Unique role identifier (within the org)
   * @param description - Optional description
   * @returns Created role
   */
  async createRole(
    orgId: number,
    name: string,
    slug: string,
    description?: string | null
  ): Promise<Role> {
    // Check for duplicate slug within org
    const existing = await this.getRoleBySlug(orgId, slug);
    if (existing) {
      throw new Error(
        `Role with slug "${slug}" already exists in this organization`
      );
    }

    const newRole: NewRole = {
      organizationId: orgId,
      name,
      slug,
      description: description ?? null,
    };

    const created = await db.insert(roles).values(newRole).returning();

    const result = created[0];
    if (!result) {
      throw new Error("Failed to create role");
    }

    // Invalidate org roles cache
    await cacheService.del(orgRolesKey(orgId));

    if (isDevelopment) {
      console.log(`[RoleService] Created role: ${slug} in org ${orgId}`);
    }

    return result;
  }

  /**
   * Get role by ID
   * @param roleId - Role ID
   * @returns Role or null
   */
  async getRoleById(roleId: number): Promise<Role | null> {
    // Try cache first
    const cacheKey = roleKey(roleId);
    const cached = await cacheService.get<Role>(cacheKey);
    if (cached) {
      return cached;
    }

    const result = await db
      .select()
      .from(roles)
      .where(eq(roles.id, roleId))
      .limit(1);

    const role = result[0] ?? null;

    // Cache the result
    if (role) {
      await cacheService.set(cacheKey, role, CacheTTL.ROLES);
    }

    return role;
  }

  /**
   * Get role by slug within an organization
   * @param orgId - Organization ID
   * @param slug - Role slug
   * @returns Role or null
   */
  async getRoleBySlug(orgId: number, slug: string): Promise<Role | null> {
    const result = await db
      .select()
      .from(roles)
      .where(and(eq(roles.organizationId, orgId), eq(roles.slug, slug)))
      .limit(1);

    const role = result[0] ?? null;

    if (role) {
      await cacheService.set(roleKey(role.id), role, CacheTTL.ROLES);
    }

    return role;
  }

  /**
   * Get all roles for an organization
   * @param orgId - Organization ID
   * @param options - Pagination options
   * @returns Role list with metadata
   */
  async getRolesByOrganization(
    orgId: number,
    options: PaginationOptions = {}
  ): Promise<RoleListResult> {
    const { limit = 50, offset = 0 } = options;

    // Try cache for full list (only for default pagination)
    if (limit === 50 && offset === 0) {
      const cacheKey = orgRolesKey(orgId);
      const cached = await cacheService.get<RoleListResult>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const roleList = await db
      .select()
      .from(roles)
      .where(eq(roles.organizationId, orgId))
      .limit(limit)
      .offset(offset)
      .orderBy(roles.name);

    const countResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(roles)
      .where(eq(roles.organizationId, orgId));

    const total = countResult[0]?.count ?? 0;

    const result = { roles: roleList, total, limit, offset };

    // Cache default pagination result
    if (limit === 50 && offset === 0) {
      await cacheService.set(orgRolesKey(orgId), result, CacheTTL.ROLES);
    }

    return result;
  }

  /**
   * Update a role
   * Note: slug is immutable
   * @param roleId - Role ID
   * @param updates - Partial updates (name, description only)
   * @returns Updated role
   */
  async updateRole(roleId: number, updates: RoleUpdate): Promise<Role> {
    const existing = await this.getRoleById(roleId);
    if (!existing) {
      throw new Error(`Role not found: ${roleId}`);
    }

    const result = await db
      .update(roles)
      .set({
        name: updates.name ?? existing.name,
        description: updates.description ?? existing.description,
        updatedAt: new Date(),
      })
      .where(eq(roles.id, roleId))
      .returning();

    const updated = result[0];
    if (!updated) {
      throw new Error(`Failed to update role: ${roleId}`);
    }

    // Invalidate caches
    await cacheService.del([
      roleKey(roleId),
      orgRolesKey(existing.organizationId ?? 0),
    ]);

    if (isDevelopment) {
      console.log(`[RoleService] Updated role: ${existing.slug}`);
    }

    return updated;
  }

  /**
   * Delete a role
   * Fails if users are assigned this role
   * @param roleId - Role ID
   */
  async deleteRole(roleId: number): Promise<void> {
    const existing = await this.getRoleById(roleId);
    if (!existing) {
      throw new Error(`Role not found: ${roleId}`);
    }

    // Check if role is assigned to any users
    const userCount = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(userRoles)
      .where(eq(userRoles.roleId, roleId));

    if ((userCount[0]?.count ?? 0) > 0) {
      throw new Error(
        `Cannot delete role "${existing.slug}" - it is assigned to ${userCount[0]?.count} user(s)`
      );
    }

    // Delete the role
    await db.delete(roles).where(eq(roles.id, roleId));

    // Invalidate caches
    await cacheService.del([
      roleKey(roleId),
      orgRolesKey(existing.organizationId ?? 0),
    ]);

    if (isDevelopment) {
      console.log(`[RoleService] Deleted role: ${existing.slug}`);
    }
  }

  /**
   * Check if a role exists
   * @param roleId - Role ID
   * @returns True if role exists
   */
  async roleExists(roleId: number): Promise<boolean> {
    const role = await this.getRoleById(roleId);
    return role !== null;
  }
}

/**
 * Singleton role service instance
 */
export const roleService = new RoleService();
