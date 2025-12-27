/**
 * Example controller demonstrating asyncHandler usage
 * This file shows the pattern for all controllers
 */

import asyncHandler from '../utilities/async-handler.js';
import { NotFoundError, ValidationError } from '../utilities/errors.js';
import logger from '../utilities/logger.js';

/**
 * Example: GET endpoint
 * Notice: No try-catch needed - asyncHandler handles it
 */
export const getExample = asyncHandler(async (req, res) => {
  // Access user from auth middleware
  const userId = req.userId; // This is a STRING (Clerk ID)
  
  logger.info({ userId }, 'Getting example data');
  
  // Simulate async operation
  const data = { message: 'Hello World', userId };
  
  res.json({
    success: true,
    data
  });
});

/**
 * Example: POST endpoint with validation
 */
export const createExample = asyncHandler(async (req, res) => {
  const { name, email } = req.body;
  
  // Validation - throw error if invalid
  if (!name || !email) {
    throw new ValidationError('Name and email are required');
  }
  
  // Simulate async operation
  const newItem = { id: 1, name, email };
  
  logger.info({ userId: req.userId, itemId: newItem.id }, 'Created example item');
  
  res.status(201).json({
    success: true,
    data: newItem
  });
});

/**
 * Example: Error handling
 * Just throw the error - asyncHandler will catch it
 */
export const getExampleById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  // Simulate not found
  if (id === '999') {
    throw new NotFoundError('Example not found');
  }
  
  const item = { id, name: 'Example Item' };
  
  res.json({
    success: true,
    data: item
  });
});

/**
 * Key Points:
 * 1. Always use asyncHandler wrapper
 * 2. No try-catch needed in controllers
 * 3. Throw errors - they'll be caught automatically
 * 4. req.userId is a STRING (Clerk ID)
 * 5. Use logger, not console.log
 * 6. Return consistent response format
 */

