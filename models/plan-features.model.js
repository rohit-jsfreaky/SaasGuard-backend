import { pgTable, serial, bigint, boolean, timestamp, unique } from 'drizzle-orm/pg-core';

/**
 * Plan-Features junction table
 * Links plans to features with enabled/disabled status
 */
export const planFeatures = pgTable('plan_features', {
  id: serial('id').primaryKey(),
  planId: bigint('plan_id', { mode: 'number' }).notNull(),
  featureId: bigint('feature_id', { mode: 'number' }).notNull(),
  enabled: boolean('enabled').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  planFeatureUnique: unique('plan_features_plan_feature_unique').on(table.planId, table.featureId)
}));

// Relations will be defined separately to avoid circular dependencies

