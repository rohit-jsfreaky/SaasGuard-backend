import { pgTable, serial, varchar, bigint, timestamp, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

/**
 * Users table
 * Stores user information synced from Clerk
 * Clerk user IDs are STRINGS - stored in clerk_id column
 */
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  clerkId: varchar('clerk_id', { length: 255 }).notNull().unique(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  organizationId: bigint('organization_id', { mode: 'number' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  clerkIdIdx: index('users_clerk_id_idx').on(table.clerkId),
  orgIdIdx: index('users_organization_id_idx').on(table.organizationId)
}));

// Relations will be defined in a separate relations file to avoid circular dependencies

