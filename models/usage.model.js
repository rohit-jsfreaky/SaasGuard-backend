import { pgTable, serial, bigint, varchar, timestamp, unique, index } from 'drizzle-orm/pg-core';

/**
 * Usage table
 * Tracks current usage of limited features per user
 * Used for enforcing plan limits
 */
export const usage = pgTable('usage', {
  id: serial('id').primaryKey(),
  userId: bigint('user_id', { mode: 'number' }).notNull(),
  featureSlug: varchar('feature_slug', { length: 255 }).notNull(),
  currentUsage: bigint('current_usage', { mode: 'number' }).default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  userFeatureUnique: unique('usage_user_feature_unique').on(table.userId, table.featureSlug),
  userIdIdx: index('usage_user_id_idx').on(table.userId)
}));

// Relations will be defined separately to avoid circular dependencies

