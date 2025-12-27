import { pgTable, serial, varchar, bigint, timestamp } from 'drizzle-orm/pg-core';

/**
 * Organizations table
 * Stores organization/tenant information
 */
export const organizations = pgTable('organizations', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  createdBy: bigint('created_by', { mode: 'number' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
});

// Relations will be defined separately to avoid circular dependencies

