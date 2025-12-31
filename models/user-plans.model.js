import { pgTable, serial, bigint, timestamp, unique, index } from 'drizzle-orm/pg-core';

/**
 * User Plans junction table
 * Links users to plans within organizations
 * Users have one plan per organization
 */
export const userPlans = pgTable('user_plans', {
  id: serial('id').primaryKey(),
  userId: bigint('user_id', { mode: 'number' }).notNull(),
  planId: bigint('plan_id', { mode: 'number' }).notNull(),
  organizationId: bigint('organization_id', { mode: 'number' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  userOrgUnique: unique('user_plans_user_org_unique').on(table.userId, table.organizationId),
  orgIdx: index('user_plans_organization_id_idx').on(table.organizationId),
  userIdIdx: index('user_plans_user_id_idx').on(table.userId)
}));

// Relations will be defined separately to avoid circular dependencies

