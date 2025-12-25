import { z } from "zod";

/**
 * Slug format regex - lowercase letters, numbers, and hyphens only
 */
const slugRegex = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/**
 * Schema for creating a new role
 */
export const CreateRoleSchema = z.object({
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
  orgId: z.number().int().positive("Organization ID is required"),
});

/**
 * Schema for updating a role
 * Note: slug is not included as it's immutable
 */
export const UpdateRoleSchema = z.object({
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
 * Schema for granting a permission to a role
 */
export const GrantPermissionSchema = z.object({
  featureSlug: z.string().min(1, "Feature slug is required").max(255),
});

/**
 * Schema for assigning a role to a user
 */
export const AssignRoleSchema = z.object({
  roleId: z.number().int().positive("Role ID is required"),
  orgId: z.number().int().positive("Organization ID is required"),
});

/**
 * Schema for role ID parameter
 */
export const RoleIdParamSchema = z.object({
  id: z.string().min(1, "Role ID is required"),
});

/**
 * Inferred types from schemas
 */
export type CreateRoleInput = z.infer<typeof CreateRoleSchema>;
export type UpdateRoleInput = z.infer<typeof UpdateRoleSchema>;
export type GrantPermissionInput = z.infer<typeof GrantPermissionSchema>;
export type AssignRoleInput = z.infer<typeof AssignRoleSchema>;
