import { pgTable, serial, varchar, text, timestamp, index } from 'drizzle-orm/pg-core';

/**
 * Features table
 * Global feature registry - features are reusable across plans
 * Slugs are globally unique and immutable
 */
export const features = pgTable('features', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  slugIdx: index('features_slug_idx').on(table.slug)
}));

// Relations will be defined separately to avoid circular dependencies

