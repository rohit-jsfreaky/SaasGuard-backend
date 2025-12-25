import { eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { users, organizations } from "../db/schema.js";
import type { User, NewUser, UserUpdate } from "../types/db.js";
import { isDevelopment } from "../config/environment.js";

/**
 * Pagination options for list queries
 */
export interface PaginationOptions {
  limit?: number;
  offset?: number;
}

/**
 * User Service
 * Handles all user-related database operations
 */
class UserService {
  /**
   * Create or update a user based on Clerk ID
   * If user exists, updates orgId if different
   * If not exists, creates new user
   *
   * @param clerkId - Clerk user ID
   * @param email - User's email address
   * @param orgId - Organization ID (optional)
   * @returns User object
   */
  async createOrUpdateUser(
    clerkId: string,
    email: string,
    orgId?: number
  ): Promise<User> {
    // Check if user exists
    const existingUser = await this.getUserByClerkId(clerkId);

    if (existingUser) {
      // Update if orgId is different or email changed
      if (existingUser.orgId !== orgId || existingUser.email !== email) {
        const updated = await db
          .update(users)
          .set({
            orgId: orgId ?? existingUser.orgId,
            email: email,
            updatedAt: new Date(),
          })
          .where(eq(users.clerkId, clerkId))
          .returning();

        const result = updated[0];
        if (!result) {
          throw new Error("Failed to update user");
        }

        if (isDevelopment) {
          console.log(`[UserService] Updated user: ${clerkId}`);
        }

        return result;
      }

      return existingUser;
    }

    // Create new user
    const newUser: NewUser = {
      clerkId,
      email,
      orgId,
    };

    const created = await db.insert(users).values(newUser).returning();

    const result = created[0];
    if (!result) {
      throw new Error("Failed to create user");
    }

    if (isDevelopment) {
      console.log(`[UserService] Created user: ${clerkId}`);
    }

    return result;
  }

  /**
   * Get user by internal database ID
   * @param userId - Internal user ID
   * @returns User or null if not found
   */
  async getUserById(userId: number): Promise<User | null> {
    const result = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return result[0] ?? null;
  }

  /**
   * Get user by Clerk ID
   * @param clerkId - Clerk user ID
   * @returns User or null if not found
   */
  async getUserByClerkId(clerkId: string): Promise<User | null> {
    const result = await db
      .select()
      .from(users)
      .where(eq(users.clerkId, clerkId))
      .limit(1);

    return result[0] ?? null;
  }

  /**
   * Get user by email address
   * @param email - Email address
   * @returns User or null if not found
   */
  async getUserByEmail(email: string): Promise<User | null> {
    const result = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    return result[0] ?? null;
  }

  /**
   * Get all users in an organization with pagination
   * @param orgId - Organization ID
   * @param options - Pagination options
   * @returns List of users
   */
  async getUsersInOrganization(
    orgId: number,
    options: PaginationOptions = {}
  ): Promise<{ users: User[]; total: number }> {
    const { limit = 50, offset = 0 } = options;

    // Get users with pagination
    const userList = await db
      .select()
      .from(users)
      .where(eq(users.orgId, orgId))
      .limit(limit)
      .offset(offset)
      .orderBy(users.createdAt);

    // Get total count
    const countResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(eq(users.orgId, orgId));

    const total = countResult[0]?.count ?? 0;

    return { users: userList, total };
  }

  /**
   * Update user by ID
   * @param userId - User ID
   * @param updates - Partial user updates
   * @returns Updated user
   */
  async updateUser(userId: number, updates: UserUpdate): Promise<User> {
    const result = await db
      .update(users)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();

    const updated = result[0];
    if (!updated) {
      throw new Error(`User not found: ${userId}`);
    }

    if (isDevelopment) {
      console.log(`[UserService] Updated user: ${userId}`);
    }

    return updated;
  }

  /**
   * Delete user by ID
   * @param userId - User ID
   */
  async deleteUser(userId: number): Promise<void> {
    const result = await db
      .delete(users)
      .where(eq(users.id, userId))
      .returning({ id: users.id });

    if (result.length === 0) {
      throw new Error(`User not found: ${userId}`);
    }

    if (isDevelopment) {
      console.log(`[UserService] Deleted user: ${userId}`);
    }
  }

  /**
   * Check if a user exists
   * @param userId - User ID
   * @returns True if user exists
   */
  async userExists(userId: number): Promise<boolean> {
    const result = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return result.length > 0;
  }

  /**
   * Sync user with Clerk data
   * Creates user if not exists, updates if data changed
   * @param clerkId - Clerk user ID
   * @param email - User email
   * @param clerkOrgId - Clerk organization ID (optional)
   * @returns User object
   */
  async syncFromClerk(
    clerkId: string,
    email: string,
    clerkOrgId?: string
  ): Promise<User> {
    // If we have a Clerk org ID, we need to find or create the corresponding org
    let orgId: number | undefined;

    if (clerkOrgId) {
      const org = await db
        .select()
        .from(organizations)
        .where(eq(organizations.clerkOrgId, clerkOrgId))
        .limit(1);

      orgId = org[0]?.id;
    }

    return this.createOrUpdateUser(clerkId, email, orgId);
  }
}

/**
 * Singleton user service instance
 */
export const userService = new UserService();
