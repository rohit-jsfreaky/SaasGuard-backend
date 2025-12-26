import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { userPlans, plans } from "../db/schema.js";
import type { UserPlan, NewUserPlan, Plan } from "../types/db.js";
import { isDevelopment } from "../config/environment.js";

class UserPlanService {
  async assignPlanToUser(
    userId: string,
    planId: number,
    organizationId: number,
    assignedBy?: string
  ): Promise<UserPlan> {
    const existing = await db
      .select()
      .from(userPlans)
      .where(
        and(
          eq(userPlans.userId, userId),
          eq(userPlans.organizationId, organizationId)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      const existingRecord = existing[0];
      if (!existingRecord) {
        throw new Error("Failed to get existing user plan");
      }
      const updated = await db
        .update(userPlans)
        .set({
          planId,
          assignedBy,
          isActive: true,
        })
        .where(eq(userPlans.id, existingRecord.id))
        .returning();

      if (isDevelopment) {
        console.log(
          `[UserPlanService] Updated user ${userId} to plan ${planId} in org ${organizationId}`
        );
      }

      const updatedResult = updated[0];
      if (!updatedResult) {
        throw new Error("Failed to update user plan");
      }
      return updatedResult;
    }

    const newUserPlan: NewUserPlan = {
      userId,
      planId,
      organizationId,
      assignedBy,
      isActive: true,
    };

    const created = await db.insert(userPlans).values(newUserPlan).returning();
    const result = created[0];

    if (!result) {
      throw new Error("Failed to create user plan");
    }

    if (isDevelopment) {
      console.log(
        `[UserPlanService] Assigned user ${userId} to plan ${planId} in org ${organizationId}`
      );
    }

    return result;
  }

  async getUserPlanInOrganization(
    userId: string,
    organizationId: number
  ): Promise<(UserPlan & { plan: Plan }) | null> {
    const result = await db
      .select({
        id: userPlans.id,
        userId: userPlans.userId,
        planId: userPlans.planId,
        organizationId: userPlans.organizationId,
        assignedAt: userPlans.assignedAt,
        assignedBy: userPlans.assignedBy,
        isActive: userPlans.isActive,
        plan: plans,
      })
      .from(userPlans)
      .innerJoin(plans, eq(userPlans.planId, plans.id))
      .where(
        and(
          eq(userPlans.userId, userId),
          eq(userPlans.organizationId, organizationId),
          eq(userPlans.isActive, true)
        )
      )
      .orderBy(desc(userPlans.assignedAt))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    const row = result[0];
    if (!row) {
      return null;
    }

    return {
      id: row.id,
      userId: row.userId,
      planId: row.planId,
      organizationId: row.organizationId,
      assignedAt: row.assignedAt,
      assignedBy: row.assignedBy,
      isActive: row.isActive,
      plan: row.plan!,
    };
  }

  async getUserPlansForOrganization(
    userId: string,
    organizationId: number,
    limit: number = 10
  ): Promise<(UserPlan & { plan: Plan })[]> {
    const result = await db
      .select({
        id: userPlans.id,
        userId: userPlans.userId,
        planId: userPlans.planId,
        organizationId: userPlans.organizationId,
        assignedAt: userPlans.assignedAt,
        assignedBy: userPlans.assignedBy,
        isActive: userPlans.isActive,
        plan: plans,
      })
      .from(userPlans)
      .innerJoin(plans, eq(userPlans.planId, plans.id))
      .where(
        and(
          eq(userPlans.userId, userId),
          eq(userPlans.organizationId, organizationId)
        )
      )
      .orderBy(desc(userPlans.assignedAt))
      .limit(limit);

    return result.map((row) => ({
      id: row.id,
      userId: row.userId,
      planId: row.planId,
      organizationId: row.organizationId,
      assignedAt: row.assignedAt,
      assignedBy: row.assignedBy,
      isActive: row.isActive,
      plan: row.plan!,
    }));
  }

  async deactivateUserPlanInOrganization(
    userId: string,
    organizationId: number
  ): Promise<void> {
    await db
      .update(userPlans)
      .set({
        isActive: false,
      })
      .where(
        and(
          eq(userPlans.userId, userId),
          eq(userPlans.organizationId, organizationId)
        )
      );

    if (isDevelopment) {
      console.log(
        `[UserPlanService] Deactivated plan for user ${userId} in org ${organizationId}`
      );
    }
  }

  async removeUserPlanInOrganization(
    userId: string,
    organizationId: number
  ): Promise<void> {
    await db
      .delete(userPlans)
      .where(
        and(
          eq(userPlans.userId, userId),
          eq(userPlans.organizationId, organizationId)
        )
      );

    if (isDevelopment) {
      console.log(
        `[UserPlanService] Removed plan for user ${userId} in org ${organizationId}`
      );
    }
  }

  async getUsersOnPlan(
    planId: number,
    limit: number = 50
  ): Promise<string[]> {
    const result = await db
      .select({ userId: userPlans.userId })
      .from(userPlans)
      .where(and(eq(userPlans.planId, planId), eq(userPlans.isActive, true)))
      .limit(limit);

    return result.map((r) => r.userId);
  }

  async getPlanStats(planId: number): Promise<{
    totalUsers: number;
    activeUsers: number;
  }> {
    const [totalResult, activeResult] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)` })
        .from(userPlans)
        .where(eq(userPlans.planId, planId)),
      db
        .select({ count: sql<number>`count(*)` })
        .from(userPlans)
        .where(
          and(eq(userPlans.planId, planId), eq(userPlans.isActive, true))
        ),
    ]);

    return {
      totalUsers: totalResult[0]?.count ?? 0,
      activeUsers: activeResult[0]?.count ?? 0,
    };
  }

  async getUserPlanById(userPlanId: number): Promise<UserPlan | null> {
    const result = await db
      .select()
      .from(userPlans)
      .where(eq(userPlans.id, userPlanId))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    return result[0] ?? null;
  }

  async updateUserPlan(
    userPlanId: number,
    updates: Partial<{
      planId: number;
      isActive: boolean;
    }>
  ): Promise<UserPlan> {
    const existing = await this.getUserPlanById(userPlanId);
    if (!existing) {
      throw new Error(`User plan not found: ${userPlanId}`);
    }

    const result = await db
      .update(userPlans)
      .set(updates)
      .where(eq(userPlans.id, userPlanId))
      .returning();

    const updated = result[0];
    if (!updated) {
      throw new Error(`Failed to update user plan: ${userPlanId}`);
    }

    if (isDevelopment) {
      console.log(
        `[UserPlanService] Updated user plan: ${userPlanId}`
      );
    }

    return updated;
  }

  async deleteUserPlan(userPlanId: number): Promise<void> {
    await db.delete(userPlans).where(eq(userPlans.id, userPlanId));

    if (isDevelopment) {
      console.log(
        `[UserPlanService] Deleted user plan: ${userPlanId}`
      );
    }
  }
}

export const userPlanService = new UserPlanService();
