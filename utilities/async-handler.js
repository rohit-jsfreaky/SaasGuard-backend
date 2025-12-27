/**
 * Async handler wrapper for Express route handlers
 * Automatically catches errors and passes them to error handling middleware
 * 
 * Usage:
 *   router.get('/users', asyncHandler(async (req, res) => {
 *     const users = await usersService.getAll();
 *     res.json(users);
 *   }));
 * 
 * @param {Function} fn - Async route handler function
 * @returns {Function} Express middleware function
 */
export const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

export default asyncHandler;

