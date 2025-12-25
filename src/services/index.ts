/**
 * Services Index
 * Central export point for all service modules
 */

// Cache service
export { cacheService, CacheTTL } from "./cache.service.js";

// Authentication services
export { clerkService, clerkClient } from "./clerk.service.js";
export type { ClerkUserInfo } from "./clerk.service.js";

// User & Organization services
export { userService } from "./user.service.js";
export type { PaginationOptions } from "./user.service.js";

export { organizationService } from "./organization.service.js";
export type { CreateOrganizationInput } from "./organization.service.js";

// Feature service
export { featureService } from "./feature.service.js";
export type { FeatureListResult } from "./feature.service.js";

// Plan services
export { planService } from "./plan.service.js";
export type { PlanListResult } from "./plan.service.js";

export { planFeatureService } from "./plan-feature.service.js";
export type { PlanFeatureWithDetails } from "./plan-feature.service.js";

export { planLimitService } from "./plan-limit.service.js";
