import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import type {
  organizations,
  users,
  features,
  plans,
  planFeatures,
  planLimits,
  roles,
  rolePermissions,
  userRoles,
  overrides,
  usage,
} from "../db/schema.js";

// =============================================================================
// ORGANIZATIONS
// =============================================================================

export type Organization = InferSelectModel<typeof organizations>;
export type NewOrganization = InferInsertModel<typeof organizations>;
export type OrganizationUpdate = Partial<
  Omit<NewOrganization, "id" | "createdAt">
>;

// =============================================================================
// USERS
// =============================================================================

export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;
export type UserUpdate = Partial<Omit<NewUser, "id" | "createdAt" | "clerkId">>;

// =============================================================================
// FEATURES
// =============================================================================

export type Feature = InferSelectModel<typeof features>;
export type NewFeature = InferInsertModel<typeof features>;
export type FeatureUpdate = Partial<Omit<NewFeature, "id" | "createdAt">>;

// =============================================================================
// PLANS
// =============================================================================

export type Plan = InferSelectModel<typeof plans>;
export type NewPlan = InferInsertModel<typeof plans>;
export type PlanUpdate = Partial<Omit<NewPlan, "id" | "createdAt">>;

// =============================================================================
// PLAN FEATURES
// =============================================================================

export type PlanFeature = InferSelectModel<typeof planFeatures>;
export type NewPlanFeature = InferInsertModel<typeof planFeatures>;

// =============================================================================
// PLAN LIMITS
// =============================================================================

export type PlanLimit = InferSelectModel<typeof planLimits>;
export type NewPlanLimit = InferInsertModel<typeof planLimits>;
export type PlanLimitUpdate = Partial<
  Omit<NewPlanLimit, "id" | "createdAt" | "planId" | "featureSlug">
>;

// =============================================================================
// ROLES
// =============================================================================

export type Role = InferSelectModel<typeof roles>;
export type NewRole = InferInsertModel<typeof roles>;
export type RoleUpdate = Partial<
  Omit<NewRole, "id" | "createdAt" | "isSystemRole">
>;

// =============================================================================
// ROLE PERMISSIONS
// =============================================================================

export type RolePermission = InferSelectModel<typeof rolePermissions>;
export type NewRolePermission = InferInsertModel<typeof rolePermissions>;
export type RolePermissionUpdate = Partial<
  Omit<NewRolePermission, "id" | "createdAt" | "roleId">
>;

// =============================================================================
// USER ROLES
// =============================================================================

export type UserRole = InferSelectModel<typeof userRoles>;
export type NewUserRole = InferInsertModel<typeof userRoles>;

// =============================================================================
// OVERRIDES
// =============================================================================

export type Override = InferSelectModel<typeof overrides>;
export type NewOverride = InferInsertModel<typeof overrides>;
export type OverrideUpdate = Partial<
  Omit<NewOverride, "id" | "createdAt" | "userId" | "createdBy">
>;

/** Override type enum values */
export type OverrideType =
  | "limit_increase"
  | "feature_enable"
  | "feature_disable";

// =============================================================================
// USAGE
// =============================================================================

export type Usage = InferSelectModel<typeof usage>;
export type NewUsage = InferInsertModel<typeof usage>;
export type UsageUpdate = Partial<
  Omit<NewUsage, "id" | "createdAt" | "userId">
>;

// =============================================================================
// EXTENDED TYPES
// =============================================================================

/** User with organization data */
export interface UserWithOrganization extends User {
  organization: Organization | null;
}

/** User with roles */
export interface UserWithRoles extends User {
  roles: (UserRole & { role: Role })[];
}

/** Plan with features and limits */
export interface PlanWithFeatures extends Plan {
  features: (PlanFeature & { feature: Feature })[];
  limits: PlanLimit[];
}

/** Role with permissions */
export interface RoleWithPermissions extends Role {
  permissions: RolePermission[];
}

/** User entitlements (computed) */
export interface UserEntitlements {
  userId: number;
  organizationId: number | null;
  features: {
    slug: string;
    enabled: boolean;
    limit: number | null;
    currentUsage: number;
    source: "plan" | "role" | "override";
  }[];
}
