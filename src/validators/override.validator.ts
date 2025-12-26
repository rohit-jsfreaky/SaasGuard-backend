import { z } from "zod";

/**
 * Override type enum matching the database enum
 */
export const OverrideTypeEnum = z.enum([
  "limit_increase",
  "feature_enable",
  "feature_disable",
]);

export type OverrideType = z.infer<typeof OverrideTypeEnum>;

/**
 * Schema for creating a new override
 */
export const CreateOverrideSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
  featureSlug: z.string().min(1, "Feature slug is required").max(255),
  overrideType: OverrideTypeEnum,
  value: z.string().max(255).optional().nullable(),
  expiresAt: z
    .string()
    .datetime()
    .optional()
    .nullable()
    .transform((val) => (val ? new Date(val) : null)),
  reason: z.string().max(1000).optional().nullable(),
});

/**
 * Schema for updating an override
 */
export const UpdateOverrideSchema = z.object({
  value: z.string().max(255).optional().nullable(),
  expiresAt: z
    .string()
    .datetime()
    .optional()
    .nullable()
    .transform((val) => (val ? new Date(val) : null)),
  reason: z.string().max(1000).optional().nullable(),
});

/**
 * Schema for creating an organization override
 */
export const CreateOrgOverrideSchema = z.object({
  featureSlug: z.string().min(1, "Feature slug is required").max(255),
  overrideType: OverrideTypeEnum,
  value: z.string().max(255).optional().nullable(),
  expiresAt: z
    .string()
    .datetime()
    .optional()
    .nullable()
    .transform((val) => (val ? new Date(val) : null)),
  reason: z.string().max(1000).optional().nullable(),
});

/**
 * Schema for override ID parameter
 */
export const OverrideIdParamSchema = z.object({
  id: z.string().min(1, "Override ID is required"),
});

/**
 * Inferred types from schemas
 */
export type CreateOverrideInput = z.infer<typeof CreateOverrideSchema>;
export type UpdateOverrideInput = z.infer<typeof UpdateOverrideSchema>;
export type CreateOrgOverrideInput = z.infer<typeof CreateOrgOverrideSchema>;
