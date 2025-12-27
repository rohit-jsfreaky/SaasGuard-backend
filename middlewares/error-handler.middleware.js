import logger from '../utilities/logger.js';
import { AppError } from '../utilities/errors.js';

/**
 * Global error handling middleware
 * Catches all errors and returns consistent error response format
 */
export const errorHandler = (err, req, res, next) => {
  const requestId = req.id || 'unknown';

  // Log error with context
  logger.error({
    err,
    requestId,
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('user-agent')
  }, 'Request error');

  // If response already sent, delegate to default Express error handler
  if (res.headersSent) {
    return next(err);
  }

  // Handle known application errors
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: {
        message: err.message,
        code: err.statusCode,
        requestId
      }
    });
  }

  // Handle validation errors (from express-validator or similar)
  if (err.name === 'ValidationError' || err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      error: {
        message: err.message || 'Validation error',
        code: 400,
        requestId
      }
    });
  }

  // Handle database errors
  if (err.code === '23505') { // PostgreSQL unique violation
    return res.status(409).json({
      success: false,
      error: {
        message: 'Resource already exists',
        code: 409,
        requestId
      }
    });
  }

  // Handle unknown errors - never expose sensitive information
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  res.status(500).json({
    success: false,
    error: {
      message: isDevelopment ? err.message : 'Internal server error',
      code: 500,
      requestId,
      ...(isDevelopment && { stack: err.stack })
    }
  });
};

export default errorHandler;

