import { eq, sql } from "drizzle-orm";
import { db, pool } from "../db/index.js";
import { organizations, users } from "../db/schema.js";
import type {
  Organization,
  NewOrganization,
  OrganizationUpdate,
} from "../types/db.js";
import { isDevelopment } from "../config/environment.js";

/**
 * Pagination options for list queries
 */
export interface PaginationOptions {
  limit?: number;
  offset?: number;
}

/**
 * Organization creation input
 */
export interface CreateOrganizationInput {
  name: string;
  slug: string;
  clerkOrgId?: string;
  createdBy?: number;
}

/**
 * Organization Service
 * Handles all organization-related database operations
 */
class OrganizationService {
  /**
   * Create a new organization
   * @param input - Organization creation data
   * @returns Created organization
   */
  async createOrganization(
    input: CreateOrganizationInput
  ): Promise<Organization> {
    const { name, slug, clerkOrgId, createdBy } = input;

    // Check for duplicate slug
    const existing = await this.getOrganizationBySlug(slug);
    if (existing) {
      throw new Error(`Organization with slug "${slug}" already exists`);
    }

    const newOrg: NewOrganization = {
      name,
      slug,
      clerkOrgId,
      createdBy,
    };

    const created = await db.insert(organizations).values(newOrg).returning();

    const result = created[0];
    if (!result) {
      throw new Error("Failed to create organization");
    }

    if (isDevelopment) {
      console.log(`[OrgService] Created organization: ${slug}`);
    }

    return result;
  }

  /**
   * Get organization by ID
   * @param orgId - Organization ID
   * @returns Organization or null if not found
   */
  async getOrganization(orgId: number): Promise<Organization | null> {
    const result = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);

    return result[0] ?? null;
  }

  /**
   * Get organization by slug
   * @param slug - Organization slug
   * @returns Organization or null if not found
   */
  async getOrganizationBySlug(slug: string): Promise<Organization | null> {
    const result = await db
      .select()
      .from(organizations)
      .where(eq(organizations.slug, slug))
      .limit(1);

    return result[0] ?? null;
  }

  /**
   * Get organization by name
   * @param name - Organization name
   * @returns Organization or null if not found
   */
  async getOrganizationByName(name: string): Promise<Organization | null> {
    const result = await db
      .select()
      .from(organizations)
      .where(eq(organizations.name, name))
      .limit(1);

    return result[0] ?? null;
  }

  /**
   * Get organization by Clerk organization ID
   * @param clerkOrgId - Clerk organization ID
   * @returns Organization or null if not found
   */
  async getOrganizationByClerkId(
    clerkOrgId: string
  ): Promise<Organization | null> {
    const result = await db
      .select()
      .from(organizations)
      .where(eq(organizations.clerkOrgId, clerkOrgId))
      .limit(1);

    return result[0] ?? null;
  }

  /**
   * Update organization
   * @param orgId - Organization ID
   * @param updates - Partial organization updates
   * @returns Updated organization
   */
  async updateOrganization(
    orgId: number,
    updates: OrganizationUpdate
  ): Promise<Organization> {
    const result = await db
      .update(organizations)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, orgId))
      .returning();

    const updated = result[0];
    if (!updated) {
      throw new Error(`Organization not found: ${orgId}`);
    }

    if (isDevelopment) {
      console.log(`[OrgService] Updated organization: ${orgId}`);
    }

    return updated;
  }

  /**
   * Delete organization
   * @param orgId - Organization ID
   */
  async deleteOrganization(orgId: number): Promise<void> {
    const result = await db
      .delete(organizations)
      .where(eq(organizations.id, orgId))
      .returning({ id: organizations.id });

    if (result.length === 0) {
      throw new Error(`Organization not found: ${orgId}`);
    }

    if (isDevelopment) {
      console.log(`[OrgService] Deleted organization: ${orgId}`);
    }
  }

  /**
   * Add user to organization
   * Updates the user's orgId to the specified organization
   *
   * @param userId - User ID
   * @param orgId - Organization ID
   */
  async addUserToOrganization(userId: number, orgId: number): Promise<void> {
    // Verify organization exists
    const org = await this.getOrganization(orgId);
    if (!org) {
      throw new Error(`Organization not found: ${orgId}`);
    }

    // Update user's organization
    const result = await db
      .update(users)
      .set({
        orgId,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning({ id: users.id });

    if (result.length === 0) {
      throw new Error(`User not found: ${userId}`);
    }

    if (isDevelopment) {
      console.log(`[OrgService] Added user ${userId} to organization ${orgId}`);
    }
  }

  /**
   * Remove user from organization
   * Sets the user's orgId to null
   *
   * @param userId - User ID
   * @param orgId - Organization ID (for verification)
   */
  async removeUserFromOrganization(
    userId: number,
    orgId: number
  ): Promise<void> {
    // Verify user is in this organization
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user[0]) {
      throw new Error(`User not found: ${userId}`);
    }

    if (user[0].orgId !== orgId) {
      throw new Error(`User ${userId} is not in organization ${orgId}`);
    }

    // Remove user from organization
    await db
      .update(users)
      .set({
        orgId: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    if (isDevelopment) {
      console.log(
        `[OrgService] Removed user ${userId} from organization ${orgId}`
      );
    }
  }

  /**
   * Get member count for an organization
   * @param orgId - Organization ID
   * @returns Number of members
   */
  async getMemberCount(orgId: number): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(eq(users.orgId, orgId));

    return result[0]?.count ?? 0;
  }

  /**
   * Check if organization exists
   * @param orgId - Organization ID
   * @returns True if organization exists
   */
  async organizationExists(orgId: number): Promise<boolean> {
    const result = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);

    return result.length > 0;
  }

  /**
   * Sync organization from Clerk
   * Creates org if not exists, updates if data changed
   *
   * @param clerkOrgId - Clerk organization ID
   * @param name - Organization name
   * @param slug - Organization slug
   * @returns Organization object
   */
  async syncFromClerk(
    clerkOrgId: string,
    name: string,
    slug: string
  ): Promise<Organization> {
    // Check if org exists by Clerk ID
    const existing = await this.getOrganizationByClerkId(clerkOrgId);

    if (existing) {
      // Update if name or slug changed
      if (existing.name !== name || existing.slug !== slug) {
        return this.updateOrganization(existing.id, { name, slug });
      }
      return existing;
    }

    // Create new organization
    return this.createOrganization({
      name,
      slug,
      clerkOrgId,
    });
  }

  /**
   * Create organization with initial admin user (transaction)
   * @param orgInput - Organization data
   * @param adminUserId - User ID to set as admin
   * @returns Created organization
   */
  async createOrganizationWithAdmin(
    orgInput: CreateOrganizationInput,
    adminUserId: number
  ): Promise<Organization> {
    // Use a transaction to ensure consistency
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Create organization
      const orgResult = await client.query(
        `INSERT INTO organizations (name, slug, clerk_org_id, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())
         RETURNING *`,
        [orgInput.name, orgInput.slug, orgInput.clerkOrgId, adminUserId]
      );

      const org = orgResult.rows[0] as Organization;

      // Update user's organization
      await client.query(
        `UPDATE users SET org_id = $1, updated_at = NOW() WHERE id = $2`,
        [org.id, adminUserId]
      );

      await client.query("COMMIT");

      if (isDevelopment) {
        console.log(
          `[OrgService] Created organization ${org.slug} with admin user ${adminUserId}`
        );
      }

      return org;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

/**
 * Singleton organization service instance
 */
export const organizationService = new OrganizationService();
