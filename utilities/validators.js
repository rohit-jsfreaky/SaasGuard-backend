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

