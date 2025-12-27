import { randomUUID } from 'crypto';

/**
 * Request ID middleware
 * Generates unique request ID and attaches to request object
 */
export const requestIdMiddleware = (req, res, next) => {
  // Generate or use existing request ID from header
  const requestId = req.headers['x-request-id'] || randomUUID();
  
  // Attach to request object
  req.id = requestId;
  
  // Add to response headers
  res.setHeader('X-Request-ID', requestId);
  
  next();
};

export default requestIdMiddleware;

