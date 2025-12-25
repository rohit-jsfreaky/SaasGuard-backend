import {
  pgTable,
  bigserial,
  varchar,
  text,
  boolean,
  timestamp,
  bigint,
  integer,
  unique,
  index,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// =============================================================================
// ENUMS
// =============================================================================

export const overrideTypeEnum = pgEnum("override_type", [
  "limit_increase",
  "feature_enable",
  "feature_disable",
]);

// =============================================================================
// ORGANIZATIONS
// =============================================================================

export const organizations = pgTable(
  "organizations",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 255 }).notNull(),
    clerkOrgId: varchar("clerk_org_id", { length: 255 }),
    createdBy: bigint("created_by", { mode: "number" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("organizations_slug_unique").on(table.slug),
    index("organizations_clerk_org_id_idx").on(table.clerkOrgId),
  ]
);

export const organizationsRelations = relations(
  organizations,
  ({ many, one }) => ({
    users: many(users),
    roles: many(roles),
    userRoles: many(userRoles),
    userPlans: many(userPlans),
    plans: many(plans),
    organizationOverrides: many(organizationOverrides),
    createdByUser: one(users, {
      fields: [organizations.createdBy],
      references: [users.id],
      relationName: "organizationCreator",
    }),
  })
);

// =============================================================================
// USERS
// =============================================================================

export const users = pgTable(
  "users",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    email: varchar("email", { length: 255 }).notNull(),
    clerkId: varchar("clerk_id", { length: 255 }).notNull(),
    orgId: bigint("org_id", { mode: "number" }).references(
      () => organizations.id,
      { onDelete: "set null" }
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("users_clerk_id_unique").on(table.clerkId),
    unique("users_email_unique").on(table.email),
    index("users_org_id_idx").on(table.orgId),
  ]
);

export const usersRelations = relations(users, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [users.orgId],
    references: [organizations.id],
  }),
  userRoles: many(userRoles),
  userPlans: many(userPlans),
  overrides: many(overrides),
  usage: many(usage),
  createdOrganizations: many(organizations, {
    relationName: "organizationCreator",
  }),
}));

// =============================================================================
// FEATURES
// =============================================================================

export const features = pgTable(
  "features",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 255 }).notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [unique("features_slug_unique").on(table.slug)]
);

export const featuresRelations = relations(features, ({ many }) => ({
  planFeatures: many(planFeatures),
  planLimits: many(planLimits),
}));

// =============================================================================
// PLANS
// =============================================================================

export const plans = pgTable(
  "plans",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 255 }).notNull(),
    description: text("description"),
    organizationId: bigint("organization_id", { mode: "number" }).references(
      () => organizations.id,
      { onDelete: "cascade" }
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("plans_org_slug_unique").on(table.organizationId, table.slug),
    index("plans_organization_id_idx").on(table.organizationId),
  ]
);

export const plansRelations = relations(plans, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [plans.organizationId],
    references: [organizations.id],
  }),
  planFeatures: many(planFeatures),
  planLimits: many(planLimits),
  userPlans: many(userPlans),
}));

// =============================================================================
// PLAN FEATURES (Junction Table)
// =============================================================================

export const planFeatures = pgTable(
  "plan_features",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    planId: bigint("plan_id", { mode: "number" })
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    featureId: bigint("feature_id", { mode: "number" })
      .notNull()
      .references(() => features.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("plan_features_plan_feature_unique").on(
      table.planId,
      table.featureId
    ),
    index("plan_features_plan_id_idx").on(table.planId),
    index("plan_features_feature_id_idx").on(table.featureId),
  ]
);

export const planFeaturesRelations = relations(planFeatures, ({ one }) => ({
  plan: one(plans, {
    fields: [planFeatures.planId],
    references: [plans.id],
  }),
  feature: one(features, {
    fields: [planFeatures.featureId],
    references: [features.id],
  }),
}));

// =============================================================================
// PLAN LIMITS
// =============================================================================

export const planLimits = pgTable(
  "plan_limits",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    planId: bigint("plan_id", { mode: "number" })
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    featureSlug: varchar("feature_slug", { length: 255 }).notNull(),
    maxLimit: integer("max_limit").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("plan_limits_plan_feature_unique").on(
      table.planId,
      table.featureSlug
    ),
    index("plan_limits_plan_id_idx").on(table.planId),
    index("plan_limits_feature_slug_idx").on(table.featureSlug),
  ]
);

export const planLimitsRelations = relations(planLimits, ({ one }) => ({
  plan: one(plans, {
    fields: [planLimits.planId],
    references: [plans.id],
  }),
}));

// =============================================================================
// ROLES
// =============================================================================

export const roles = pgTable(
  "roles",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 255 }).notNull(),
    description: text("description"),
    organizationId: bigint("organization_id", { mode: "number" }).references(
      () => organizations.id,
      { onDelete: "cascade" }
    ),
    isSystemRole: boolean("is_system_role").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("roles_org_slug_unique").on(table.organizationId, table.slug),
    index("roles_organization_id_idx").on(table.organizationId),
  ]
);

export const rolesRelations = relations(roles, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [roles.organizationId],
    references: [organizations.id],
  }),
  rolePermissions: many(rolePermissions),
  userRoles: many(userRoles),
}));

// =============================================================================
// ROLE PERMISSIONS
// =============================================================================

export const rolePermissions = pgTable(
  "role_permissions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    roleId: bigint("role_id", { mode: "number" })
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    featureSlug: varchar("feature_slug", { length: 255 }).notNull(),
    granted: boolean("granted").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("role_permissions_role_feature_unique").on(
      table.roleId,
      table.featureSlug
    ),
    index("role_permissions_role_id_idx").on(table.roleId),
    index("role_permissions_feature_slug_idx").on(table.featureSlug),
  ]
);

export const rolePermissionsRelations = relations(
  rolePermissions,
  ({ one }) => ({
    role: one(roles, {
      fields: [rolePermissions.roleId],
      references: [roles.id],
    }),
  })
);

// =============================================================================
// USER ROLES
// =============================================================================

export const userRoles = pgTable(
  "user_roles",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: bigint("role_id", { mode: "number" })
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    organizationId: bigint("organization_id", { mode: "number" }).references(
      () => organizations.id,
      { onDelete: "cascade" }
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("user_roles_user_role_org_unique").on(
      table.userId,
      table.roleId,
      table.organizationId
    ),
    index("user_roles_user_id_idx").on(table.userId),
    index("user_roles_role_id_idx").on(table.roleId),
    index("user_roles_organization_id_idx").on(table.organizationId),
  ]
);

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, {
    fields: [userRoles.userId],
    references: [users.id],
  }),
  role: one(roles, {
    fields: [userRoles.roleId],
    references: [roles.id],
  }),
  organization: one(organizations, {
    fields: [userRoles.organizationId],
    references: [organizations.id],
  }),
}));

// =============================================================================
// OVERRIDES
// =============================================================================

export const overrides = pgTable(
  "overrides",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    featureSlug: varchar("feature_slug", { length: 255 }).notNull(),
    overrideType: overrideTypeEnum("override_type").notNull(),
    value: varchar("value", { length: 255 }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdBy: bigint("created_by", { mode: "number" }).references(
      () => users.id,
      { onDelete: "set null" }
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("overrides_user_id_idx").on(table.userId),
    index("overrides_feature_slug_idx").on(table.featureSlug),
    index("overrides_expires_at_idx").on(table.expiresAt),
  ]
);

export const overridesRelations = relations(overrides, ({ one }) => ({
  user: one(users, {
    fields: [overrides.userId],
    references: [users.id],
    relationName: "userOverrides",
  }),
  createdByUser: one(users, {
    fields: [overrides.createdBy],
    references: [users.id],
    relationName: "createdOverrides",
  }),
}));

// =============================================================================
// USER PLANS (User-Plan Assignment)
// =============================================================================

export const userPlans = pgTable(
  "user_plans",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    planId: bigint("plan_id", { mode: "number" })
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    organizationId: bigint("organization_id", { mode: "number" }).references(
      () => organizations.id,
      { onDelete: "cascade" }
    ),
    assignedAt: timestamp("assigned_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    assignedBy: bigint("assigned_by", { mode: "number" }).references(
      () => users.id,
      { onDelete: "set null" }
    ),
    isActive: boolean("is_active").default(true).notNull(),
  },
  (table) => [
    unique("user_plans_user_org_unique").on(table.userId, table.organizationId),
    index("user_plans_user_id_idx").on(table.userId),
    index("user_plans_plan_id_idx").on(table.planId),
    index("user_plans_organization_id_idx").on(table.organizationId),
  ]
);

export const userPlansRelations = relations(userPlans, ({ one }) => ({
  user: one(users, {
    fields: [userPlans.userId],
    references: [users.id],
  }),
  plan: one(plans, {
    fields: [userPlans.planId],
    references: [plans.id],
  }),
  organization: one(organizations, {
    fields: [userPlans.organizationId],
    references: [organizations.id],
  }),
  assignedByUser: one(users, {
    fields: [userPlans.assignedBy],
    references: [users.id],
    relationName: "assignedPlans",
  }),
}));

// =============================================================================
// ORGANIZATION OVERRIDES
// =============================================================================

export const organizationOverrides = pgTable(
  "organization_overrides",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    organizationId: bigint("organization_id", { mode: "number" })
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    featureSlug: varchar("feature_slug", { length: 255 }).notNull(),
    overrideType: overrideTypeEnum("override_type").notNull(),
    value: varchar("value", { length: 255 }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdBy: bigint("created_by", { mode: "number" }).references(
      () => users.id,
      { onDelete: "set null" }
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("org_overrides_org_id_idx").on(table.organizationId),
    index("org_overrides_feature_slug_idx").on(table.featureSlug),
    index("org_overrides_expires_at_idx").on(table.expiresAt),
  ]
);

export const organizationOverridesRelations = relations(
  organizationOverrides,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [organizationOverrides.organizationId],
      references: [organizations.id],
    }),
    createdByUser: one(users, {
      fields: [organizationOverrides.createdBy],
      references: [users.id],
      relationName: "createdOrgOverrides",
    }),
  })
);

// =============================================================================
// USAGE
// =============================================================================

export const usage = pgTable(
  "usage",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    featureSlug: varchar("feature_slug", { length: 255 }).notNull(),
    currentUsage: integer("current_usage").default(0).notNull(),
    periodStart: timestamp("period_start", { withTimezone: true })
      .defaultNow()
      .notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("usage_user_feature_period_unique").on(
      table.userId,
      table.featureSlug,
      table.periodStart
    ),
    index("usage_user_id_idx").on(table.userId),
    index("usage_feature_slug_idx").on(table.featureSlug),
    index("usage_period_idx").on(table.periodStart, table.periodEnd),
  ]
);

export const usageRelations = relations(usage, ({ one }) => ({
  user: one(users, {
    fields: [usage.userId],
    references: [users.id],
  }),
}));
