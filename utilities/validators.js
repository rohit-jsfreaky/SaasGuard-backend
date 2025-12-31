import { z } from "zod";
import { ValidationError } from "./errors.js";

/**
 * Common validation schemas
 */
export const schemas = {
  uuid: z.string().uuid("Invalid UUID format"),
  email: z.string().email("Invalid email format"),
  nonEmptyString: z.string().min(1, "String cannot be empty"),
  positiveInteger: z.number().int().positive("Must be a positive integer"),
  nonNegativeInteger: z
    .number()
    .int()
    .nonnegative("Must be a non-negative integer"),
};

/**
 * User validation functions
 */

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {string|null} Error message or null if valid
 */
export function validateEmail(email) {
  if (!email) {
    return "Email is required";
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return "Invalid email format";
  }

  return null;
}

/**
 * Validate Clerk ID format
 * @param {string} clerkId - Clerk ID to validate
 * @returns {string|null} Error message or null if valid
 */
export function validateClerkId(clerkId) {
  if (!clerkId) {
    return "Clerk ID is required";
  }

  if (typeof clerkId !== "string") {
    return "Clerk ID must be a string";
  }

  if (clerkId.trim().length === 0) {
    return "Clerk ID cannot be empty";
  }

  // Clerk IDs typically start with 'user_' or are alphanumeric
  // Basic validation - adjust based on your Clerk setup
  if (clerkId.length < 10) {
    return "Invalid Clerk ID format";
  }

  return null;
}

/**
 * Validate data against a Zod schema
 * @param {z.ZodSchema} schema - Zod schema to validate against
 * @param {any} data - Data to validate
 * @returns {object} - Validated data
 * @throws {ValidationError} - If validation fails
 */
export function validate(schema, data) {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.errors.map(
        (err) => `${err.path.join(".")}: ${err.message}`
      );
      throw new ValidationError(messages.join(", "));
    }
    throw error;
  }
}

/**
 * Feature validation functions
 */

/**
 * Validate feature name
 * @param {string} name - Feature name to validate
 * @returns {string|null} Error message or null if valid
 */
export function validateFeatureName(name) {
  if (!name) {
    return "Feature name is required";
  }

  if (typeof name !== "string") {
    return "Feature name must be a string";
  }

  if (name.trim().length === 0) {
    return "Feature name cannot be empty";
  }

  if (name.trim().length > 255) {
    return "Feature name cannot exceed 255 characters";
  }

  return null;
}

/**
 * Validate feature slug
 * @param {string} slug - Feature slug to validate
 * @returns {string|null} Error message or null if valid
 */
export function validateFeatureSlug(slug) {
  if (!slug) {
    return "Feature slug is required";
  }

  if (typeof slug !== "string") {
    return "Feature slug must be a string";
  }

  if (slug.trim().length === 0) {
    return "Feature slug cannot be empty";
  }

  // Slug must be lowercase, alphanumeric, and can contain hyphens
  const slugRegex = /^[a-z0-9-]+$/;
  if (!slugRegex.test(slug)) {
    return "Slug must be lowercase, alphanumeric, and can contain hyphens only";
  }

  if (slug.length > 255) {
    return "Feature slug cannot exceed 255 characters";
  }

  // Cannot start or end with hyphen
  if (slug.startsWith("-") || slug.endsWith("-")) {
    return "Slug cannot start or end with a hyphen";
  }

  // Cannot have consecutive hyphens
  if (slug.includes("--")) {
    return "Slug cannot contain consecutive hyphens";
  }

  return null;
}

/**
 * Generate slug from feature name
 * Converts name to lowercase, replaces spaces with hyphens, removes special chars
 * @param {string} name - Feature name to slugify
 * @returns {string} Generated slug
 */
export function slugifyFeatureName(name) {
  if (!name || typeof name !== "string") {
    return "";
  }

  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // Remove special characters
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/-+/g, "-") // Replace multiple hyphens with single hyphen
    .replace(/^-+|-+$/g, ""); // Remove leading/trailing hyphens
}

/**
 * Plan validation functions
 */

/**
 * Validate plan name
 * @param {string} name - Plan name to validate
 * @returns {string|null} Error message or null if valid
 */
export function validatePlanName(name) {
  if (!name) {
    return "Plan name is required";
  }

  if (typeof name !== "string") {
    return "Plan name must be a string";
  }

  if (name.trim().length === 0) {
    return "Plan name cannot be empty";
  }

  if (name.trim().length > 255) {
    return "Plan name cannot exceed 255 characters";
  }

  return null;
}

/**
 * Validate plan slug
 * @param {string} slug - Plan slug to validate
 * @returns {string|null} Error message or null if valid
 */
export function validatePlanSlug(slug) {
  if (!slug) {
    return "Plan slug is required";
  }

  if (typeof slug !== "string") {
    return "Plan slug must be a string";
  }

  if (slug.trim().length === 0) {
    return "Plan slug cannot be empty";
  }

  // Slug must be lowercase, alphanumeric, and can contain hyphens
  const slugRegex = /^[a-z0-9-]+$/;
  if (!slugRegex.test(slug)) {
    return "Slug must be lowercase, alphanumeric, and can contain hyphens only";
  }

  if (slug.length > 255) {
    return "Plan slug cannot exceed 255 characters";
  }

  // Cannot start or end with hyphen
  if (slug.startsWith("-") || slug.endsWith("-")) {
    return "Slug cannot start or end with a hyphen";
  }

  // Cannot have consecutive hyphens
  if (slug.includes("--")) {
    return "Slug cannot contain consecutive hyphens";
  }

  return null;
}

/**
 * Validate limit value
 * @param {number} limit - Limit value to validate
 * @returns {string|null} Error message or null if valid
 */
export function validateLimit(limit) {
  if (limit === null || limit === undefined) {
    return null; // Null is valid (means unlimited)
  }

  if (typeof limit !== "number") {
    return "Limit must be a number";
  }

  if (!Number.isInteger(limit)) {
    return "Limit must be an integer";
  }

  if (limit < 0) {
    return "Limit must be non-negative";
  }

  return null;
}

/**
 * Role validation functions
 */

/**
 * Validate role name
 * @param {string} name - Role name to validate
 * @returns {string|null} Error message or null if valid
 */
export function validateRoleName(name) {
  if (!name) {
    return 'Role name is required';
  }

  if (typeof name !== 'string') {
    return 'Role name must be a string';
  }

  if (name.trim().length === 0) {
    return 'Role name cannot be empty';
  }

  if (name.trim().length > 255) {
    return 'Role name cannot exceed 255 characters';
  }

  return null;
}

/**
 * Validate role slug
 * @param {string} slug - Role slug to validate
 * @param {number} orgId - Organization ID (optional, for uniqueness check)
 * @returns {string|null} Error message or null if valid
 */
export function validateRoleSlug(slug) {
  if (!slug) {
    return 'Role slug is required';
  }

  if (typeof slug !== 'string') {
    return 'Role slug must be a string';
  }

  if (slug.trim().length === 0) {
    return 'Role slug cannot be empty';
  }

  // Slug must be lowercase, alphanumeric, and can contain hyphens
  const slugRegex = /^[a-z0-9-]+$/;
  if (!slugRegex.test(slug)) {
    return 'Slug must be lowercase, alphanumeric, and can contain hyphens only';
  }

  if (slug.length > 255) {
    return 'Role slug cannot exceed 255 characters';
  }

  // Cannot start or end with hyphen
  if (slug.startsWith('-') || slug.endsWith('-')) {
    return 'Slug cannot start or end with a hyphen';
  }

  // Cannot have consecutive hyphens
  if (slug.includes('--')) {
    return 'Slug cannot contain consecutive hyphens';
  }

  return null;
}

/**
 * Generate slug from role name
 * Converts name to lowercase, replaces spaces with hyphens, removes special chars
 * @param {string} name - Role name to slugify
 * @returns {string} Generated slug
 */
export function slugifyRoleName(name) {
  if (!name || typeof name !== 'string') {
    return '';
  }

  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
}

export default {
  schemas,
  validate,
  validateFeatureName,
  validateFeatureSlug,
  slugifyFeatureName,
  validatePlanName,
  validatePlanSlug,
  validateLimit,
  validateRoleName,
  validateRoleSlug,
  slugifyRoleName,
};
