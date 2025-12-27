import express from 'express';
import cors from 'cors';
import config from './config/env.js';
import logger from './utilities/logger.js';
import { requestIdMiddleware } from './middlewares/request-id.middleware.js';
import { errorHandler } from './middlewares/error-handler.middleware.js';
import { clerkAuthMiddleware } from './middlewares/auth.middleware.js';
import routes from './routes/index.js';

// Initialize Express app
const app = express();

// Trust proxy (for production behind reverse proxy)
app.set('trust proxy', 1);

// CORS middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID']
}));

// Request ID middleware (must be early in the chain)
app.use(requestIdMiddleware);

// Clerk authentication middleware (must be before routes)
app.use(clerkAuthMiddleware);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  logger.info({
    method: req.method,
    url: req.url,
    ip: req.ip,
    requestId: req.id
  }, 'Incoming request');
  next();
});

// Mount routes
app.use('/', routes);

// 404 handler
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    error: {
      message: 'Route not found',
      code: 404,
      requestId: req.id
    }
  });
});

// Global error handler (must be last)
app.use(errorHandler);

// Start server
const server = app.listen(config.port, () => {
  logger.info({
    port: config.port,
    env: config.env,
    nodeVersion: process.version
  }, 'Server started');
});

// Graceful shutdown handler
const gracefulShutdown = async (signal) => {
  logger.info({ signal }, 'Received shutdown signal');
  
  server.close(async () => {
    logger.info('HTTP server closed');
    
    // Close Redis connection
    try {
      const cacheService = (await import('./services/cache.service.js')).default;
      await cacheService.close();
    } catch (error) {
      logger.warn({ error }, 'Error closing Redis connection');
    }
    
    // Close database connections if needed
    // pool.end() will be called here when db.js is imported
    
    process.exit(0);
  });

  // Force close after 10 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.fatal({ error }, 'Uncaught exception');
  gracefulShutdown('uncaughtException');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.fatal({ reason, promise }, 'Unhandled rejection');
  gracefulShutdown('unhandledRejection');
});

export default app;

