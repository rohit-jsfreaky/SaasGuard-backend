import { UnauthorizedError } from './errors.js';

/**
 * Extract Bearer token from Authorization header
 * @param {string} authHeader - Authorization header value
 * @returns {string} - Extracted token
 * @throws {UnauthorizedError} - If header is missing or malformed
 */
export const extractToken = (authHeader) => {
  if (!authHeader) {
    throw new UnauthorizedError('Missing Authorization header');
  }

  if (!authHeader.startsWith('Bearer ')) {
    throw new UnauthorizedError('Invalid Authorization header format. Expected: Bearer {token}');
  }

  const token = authHeader.substring(7).trim(); // Remove 'Bearer ' prefix

  if (!token) {
    throw new UnauthorizedError('Token is missing in Authorization header');
  }

  return token;
};

export default extractToken;

