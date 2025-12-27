import { pgTable, serial, varchar, text, bigint, timestamp, unique, index } from 'drizzle-orm/pg-core';

/**
 * Plans table
 * Organization-scoped subscription plans
 * Slug is unique within organization
 */
export const plans = pgTable('plans', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull(),
  description: text('description'),
  organizationId: bigint('organization_id', { mode: 'number' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  orgSlugUnique: unique('plans_org_slug_unique').on(table.organizationId, table.slug),
  orgIdx: index('plans_organization_id_idx').on(table.organizationId)
}));

// Relations will be defined separately to avoid circular dependencies

