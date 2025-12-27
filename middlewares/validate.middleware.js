import { validate as zodValidate } from '../utilities/validators.js';

/**
 * Validation middleware factory
 * Creates middleware that validates request body against a Zod schema
 */
export const validate = (schema) => {
  return (req, res, next) => {
    try {
      // Validate request body
      req.body = zodValidate(schema, req.body);
      next();
    } catch (error) {
      next(error);
    }
  };
};

export default validate;

