import { pgTable, serial, bigint, varchar, boolean, timestamp, unique } from 'drizzle-orm/pg-core';

/**
 * Role Permissions junction table
 * Links roles to feature permissions
 * Uses feature_slug (not feature_id) for flexibility
 */
export const rolePermissions = pgTable('role_permissions', {
  id: serial('id').primaryKey(),
  roleId: bigint('role_id', { mode: 'number' }).notNull(),
  featureSlug: varchar('feature_slug', { length: 255 }).notNull(),
  granted: boolean('granted').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  roleFeatureSlugUnique: unique('role_permissions_role_feature_slug_unique').on(table.roleId, table.featureSlug)
}));

// Relations will be defined separately to avoid circular dependencies

