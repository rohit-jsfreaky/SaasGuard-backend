import { pgTable, serial, bigint, varchar, timestamp, unique } from 'drizzle-orm/pg-core';

/**
 * Plan Limits table
 * Defines usage limits for features within plans
 * null maxLimit = unlimited
 */
export const planLimits = pgTable('plan_limits', {
  id: serial('id').primaryKey(),
  planId: bigint('plan_id', { mode: 'number' }).notNull(),
  featureSlug: varchar('feature_slug', { length: 255 }).notNull(),
  maxLimit: bigint('max_limit', { mode: 'number' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  planFeatureSlugUnique: unique('plan_limits_plan_feature_slug_unique').on(table.planId, table.featureSlug)
}));

// Relations will be defined separately to avoid circular dependencies

