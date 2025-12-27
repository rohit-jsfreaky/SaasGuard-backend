import { pgTable, serial, bigint, varchar, text, timestamp, index } from 'drizzle-orm/pg-core';

/**
 * Overrides table
 * User and organization-level exceptions to plan rules
 * Highest priority in permission resolution
 */
export const overrides = pgTable('overrides', {
  id: serial('id').primaryKey(),
  userId: bigint('user_id', { mode: 'number' }), // nullable for org-level overrides
  organizationId: bigint('organization_id', { mode: 'number' }), // nullable for user-level overrides
  featureSlug: varchar('feature_slug', { length: 255 }).notNull(),
  overrideType: varchar('override_type', { length: 50 }).notNull(), // 'feature_enable', 'feature_disable', 'limit_increase'
  value: bigint('value', { mode: 'number' }), // numeric value for limit_increase, null for feature toggles
  expiresAt: timestamp('expires_at', { withTimezone: true }), // null = permanent
  reason: text('reason'),
  createdBy: bigint('created_by', { mode: 'number' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  userExpiresIdx: index('overrides_user_expires_idx').on(table.userId, table.expiresAt),
  featureSlugIdx: index('overrides_feature_slug_idx').on(table.featureSlug)
}));

// Relations will be defined separately to avoid circular dependencies

