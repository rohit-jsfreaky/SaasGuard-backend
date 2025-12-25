import { clerkClient } from "@clerk/express";

/**
 * User information from Clerk
 */
export interface ClerkUserInfo {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  imageUrl: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Clerk Service
 * Provides helper methods for interacting with the Clerk API
 * Uses clerkClient from @clerk/express
 */
class ClerkService {
  /**
   * Get user information from Clerk
   * @param userId - Clerk user ID
   * @returns User information
   */
  async getUserInfo(userId: string): Promise<ClerkUserInfo> {
    try {
      const user = await clerkClient.users.getUser(userId);

      return {
        id: user.id,
        email: user.emailAddresses[0]?.emailAddress ?? "",
        firstName: user.firstName,
        lastName: user.lastName,
        fullName:
          `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || null,
        imageUrl: user.imageUrl,
        createdAt: new Date(user.createdAt),
        updatedAt: new Date(user.updatedAt),
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to get user info";
      throw new Error(`User not found: ${message}`);
    }
  }

  /**
   * Get user's primary email address
   * @param userId - Clerk user ID
   * @returns Primary email address or null
   */
  async getUserEmail(userId: string): Promise<string | null> {
    try {
      const user = await clerkClient.users.getUser(userId);
      return user.emailAddresses[0]?.emailAddress ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Check if a user exists in Clerk
   * @param userId - Clerk user ID
   * @returns True if user exists
   */
  async userExists(userId: string): Promise<boolean> {
    try {
      await clerkClient.users.getUser(userId);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get organization membership for a user
   * @param userId - Clerk user ID
   * @param organizationId - Clerk organization ID
   * @returns Organization membership or null
   */
  async getOrganizationMembership(
    userId: string,
    organizationId: string
  ): Promise<{ role: string } | null> {
    try {
      const memberships = await clerkClient.users.getOrganizationMembershipList(
        {
          userId,
        }
      );

      const membership = memberships.data.find(
        (m) => m.organization.id === organizationId
      );

      if (!membership) {
        return null;
      }

      return { role: membership.role };
    } catch {
      return null;
    }
  }

  /**
   * Get all users in an organization
   * @param organizationId - Clerk organization ID
   * @returns List of organization members
   */
  async getOrganizationMembers(organizationId: string) {
    try {
      const members =
        await clerkClient.organizations.getOrganizationMembershipList({
          organizationId,
        });

      return members.data.map((member) => ({
        userId: member.publicUserData?.userId ?? "",
        role: member.role,
        firstName: member.publicUserData?.firstName ?? null,
        lastName: member.publicUserData?.lastName ?? null,
        email: member.publicUserData?.identifier ?? "",
        imageUrl: member.publicUserData?.imageUrl ?? "",
      }));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to get members";
      throw new Error(`Organization not found: ${message}`);
    }
  }
}

/**
 * Singleton Clerk service instance
 */
export const clerkService = new ClerkService();

/**
 * Export the Clerk client for advanced use cases
 */
export { clerkClient };
