import { pgTable, serial, bigint, timestamp, unique, index } from 'drizzle-orm/pg-core';

/**
 * User Roles junction table
 * Links users to roles within organizations
 * Users can have multiple roles per organization
 */
export const userRoles = pgTable('user_roles', {
  id: serial('id').primaryKey(),
  userId: bigint('user_id', { mode: 'number' }).notNull(),
  roleId: bigint('role_id', { mode: 'number' }).notNull(),
  organizationId: bigint('organization_id', { mode: 'number' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  userRoleOrgUnique: unique('user_roles_user_role_org_unique').on(table.userId, table.roleId, table.organizationId),
  orgIdx: index('user_roles_organization_id_idx').on(table.organizationId)
}));

// Relations will be defined separately to avoid circular dependencies

