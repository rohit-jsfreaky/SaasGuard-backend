import { z } from 'zod';
import { ValidationError } from './errors.js';

/**
 * Common validation schemas
 */
export const schemas = {
  uuid: z.string().uuid('Invalid UUID format'),
  email: z.string().email('Invalid email format'),
  nonEmptyString: z.string().min(1, 'String cannot be empty'),
  positiveInteger: z.number().int().positive('Must be a positive integer'),
  nonNegativeInteger: z.number().int().nonnegative('Must be a non-negative integer')
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
    return 'Email is required';
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return 'Invalid email format';
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
    return 'Clerk ID is required';
  }

  if (typeof clerkId !== 'string') {
    return 'Clerk ID must be a string';
  }

  if (clerkId.trim().length === 0) {
    return 'Clerk ID cannot be empty';
  }

  // Clerk IDs typically start with 'user_' or are alphanumeric
  // Basic validation - adjust based on your Clerk setup
  if (clerkId.length < 10) {
    return 'Invalid Clerk ID format';
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
      const messages = error.errors.map(err => `${err.path.join('.')}: ${err.message}`);
      throw new ValidationError(messages.join(', '));
    }
    throw error;
  }
}

export default {
  schemas,
  validate
};

