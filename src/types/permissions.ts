/**
 * Permission Types
 * Core types for the SaaS Guard permission resolution system
 */

/**
 * Limit information for a feature
 */
export interface LimitInfo {
  /** Maximum allowed usage */
  max: number;
  /** Current usage count */
  used: number;
  /** Remaining usage allowance */
  remaining: number;
  /** Whether limit has been exceeded */
  exceeded: boolean;
}

/**
 * Permission status for a feature
 */
export interface FeaturePermission {
  /** Feature slug */
  slug: string;
  /** Whether the feature is enabled */
  enabled: boolean;
  /** Source of the permission (plan, role, override) */
  source: "plan" | "role" | "override" | "default";
}

/**
 * The full permission map returned by permission resolution
 */
export interface PermissionMap {
  /** Map of feature slug to enabled/disabled status */
  features: Record<string, boolean>;

  /** Map of feature slug to limit information */
  limits: Record<string, LimitInfo>;

  /** Timestamp when permissions were resolved */
  resolvedAt: Date;

  /** User ID these permissions are for */
  userId: number;

  /** Organization ID context */
  orgId: number;

  /** Whether this is from cache */
  cached: boolean;
}

/**
 * Permission resolution context with all loaded data
 */
export interface PermissionContext {
  userId: number;
  orgId: number;

  /** Plan-based feature permissions (from plan_features) */
  planFeatures: Map<string, boolean>;

  /** Plan-based limits (from plan_limits) */
  planLimits: Map<string, number>;

  /** Role-based permissions (from role_permissions) */
  rolePermissions: Set<string>;

  /** User-level overrides */
  userOverrides: Map<
    string,
    {
      type: string;
      value: string | null;
    }
  >;

  /** Current usage */
  usage: Map<string, number>;
}

/**
 * Permission check result
 */
export interface PermissionCheckResult {
  /** Whether the action is allowed */
  allowed: boolean;
  /** Reason for the decision */
  reason: string;
  /** Current limit info if applicable */
  limit?: LimitInfo;
}

/**
 * Bulk permission check request
 */
export interface BulkPermissionRequest {
  userId: number;
  orgId: number;
  featureSlugs: string[];
}

/**
 * Bulk permission check response
 */
export interface BulkPermissionResponse {
  permissions: Record<string, boolean>;
  limits: Record<string, LimitInfo>;
  resolvedAt: Date;
}
