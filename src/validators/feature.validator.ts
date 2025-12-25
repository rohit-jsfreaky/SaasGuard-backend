import { z } from "zod";

/**
 * Slug format regex - lowercase letters, numbers, and hyphens only
 * Must start with a letter, can't end with a hyphen
 */
const slugRegex = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/**
 * Schema for creating a new feature
 */
export const CreateFeatureSchema = z.object({
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
 * Schema for updating a feature
 * Note: slug is not included as it's immutable
 */
export const UpdateFeatureSchema = z.object({
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
 * Schema for feature ID parameter
 */
export const FeatureIdParamSchema = z.object({
  id: z.string().min(1, "Feature ID is required"),
});

/**
 * Schema for feature search query
 */
export const FeatureSearchSchema = z.object({
  query: z.string().min(1, "Search query is required").max(100),
});

/**
 * Schema for pagination query parameters
 */
export const PaginationSchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 50))
    .pipe(z.number().min(1).max(100)),
  offset: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 0))
    .pipe(z.number().min(0)),
});

/**
 * Inferred types from schemas
 */
export type CreateFeatureInput = z.infer<typeof CreateFeatureSchema>;
export type UpdateFeatureInput = z.infer<typeof UpdateFeatureSchema>;
export type PaginationInput = z.infer<typeof PaginationSchema>;

/**
 * Validate slug format
 * @param slug - Slug to validate
 * @returns True if valid
 */
export function isValidSlug(slug: string): boolean {
  return slugRegex.test(slug);
}

/**
 * Normalize slug (lowercase, replace spaces with hyphens, remove invalid chars)
 * @param slug - Raw slug input
 * @returns Normalized slug
 */
export function normalizeSlug(slug: string): string {
  return slug
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
