import { z } from "zod";

/**
 * Slug format regex - lowercase letters, numbers, and hyphens only
 */
const slugRegex = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/**
 * Schema for creating a new plan
 */
export const CreatePlanSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(255, "Name must be 255 characters or less")
    .trim(),
  slug: z
    .string()
    .min(1, "Slug is required")
    .max(255, "Slug must be 255 characters or less")
    .regex(
      slugRegex,
      "Slug must be lowercase, start with a letter, and contain only letters, numbers, and hyphens"
    )
    .transform((s) => s.toLowerCase()),
  description: z
    .string()
    .max(1000, "Description must be 1000 characters or less")
    .optional()
    .nullable(),
});

/**
 * Schema for updating a plan
 * Note: slug is not included as it's immutable
 */
export const UpdatePlanSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(255, "Name must be 255 characters or less")
    .trim()
    .optional(),
  description: z
    .string()
    .max(1000, "Description must be 1000 characters or less")
    .optional()
    .nullable(),
});

/**
 * Schema for adding a feature to a plan
 */
export const AddFeatureToPlanSchema = z.object({
  featureId: z.number().int().positive("Feature ID must be a positive integer"),
  enabled: z.boolean().default(true),
});

/**
 * Schema for setting a limit on a feature
 */
export const SetLimitSchema = z.object({
  featureSlug: z.string().min(1, "Feature slug is required").max(255),
  maxLimit: z.number().int().min(0, "Limit must be non-negative"),
});

/**
 * Schema for plan ID parameter
 */
export const PlanIdParamSchema = z.object({
  id: z.string().min(1, "Plan ID is required"),
});

/**
 * Schema for organization ID parameter
 */
export const OrgIdParamSchema = z.object({
  orgId: z.string().min(1, "Organization ID is required"),
});

/**
 * Inferred types from schemas
 */
export type CreatePlanInput = z.infer<typeof CreatePlanSchema>;
export type UpdatePlanInput = z.infer<typeof UpdatePlanSchema>;
export type AddFeatureToPlanInput = z.infer<typeof AddFeatureToPlanSchema>;
export type SetLimitInput = z.infer<typeof SetLimitSchema>;
