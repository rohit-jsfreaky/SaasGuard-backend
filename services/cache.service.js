import { createClient } from 'redis';
import config from '../config/env.js';
import logger from '../utilities/logger.js';

/**
 * CacheService - Redis caching service
 * Supports both local Redis (development) and Upstash Redis (production)
 * Handles failures gracefully - system works even if Redis is down
 */
class CacheService {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.connectionAttempted = false;
  }

  /**
   * Initialize Redis client
   * Connects to local Redis in development, Upstash in production
   */
  async initialize() {
    if (!config.redis.enabled) {
      logger.warn('Redis caching is disabled - cache operations will be skipped');
      return;
    }

    if (this.connectionAttempted) {
      return;
    }

    this.connectionAttempted = true;

    try {
      // Determine connection method based on environment
      const isProduction = config.env === 'production';
      const useUpstash = isProduction && config.redis.upstashUrl;

      let clientConfig;

      if (useUpstash || config.redis.url?.includes('upstash')) {
        // Upstash Redis - use connection URL
        logger.info('Connecting to Upstash Redis...');
        clientConfig = {
          url: config.redis.upstashUrl || config.redis.url
        };
      } else {
        // Local Redis - use connection details or URL
        logger.info('Connecting to local Redis...');
        if (config.redis.url) {
          clientConfig = {
            url: config.redis.url
          };
        } else {
          clientConfig = {
            socket: {
              host: config.redis.host,
              port: config.redis.port
            },
            password: config.redis.password
          };
        }
      }

      this.client = createClient(clientConfig);

      // Error handling
      this.client.on('error', (err) => {
        logger.error({ err }, 'Redis client error');
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        logger.info('Redis client connecting...');
      });

      this.client.on('ready', () => {
        logger.info('Redis client ready');
        this.isConnected = true;
      });

      this.client.on('reconnecting', () => {
        logger.warn('Redis client reconnecting...');
        this.isConnected = false;
      });

      this.client.on('end', () => {
        logger.warn('Redis connection ended');
        this.isConnected = false;
      });

      // Connect to Redis
      await this.client.connect();
      this.isConnected = true;
      logger.info('Redis cache service initialized successfully');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize Redis client');
      this.isConnected = false;
      // Don't throw - allow app to continue without cache
    }
  }

  /**
   * Set a value in cache
   * @param {string} key - Cache key
   * @param {any} value - Value to cache (will be JSON serialized)
   * @param {number} ttl - Time to live in seconds (default: 3600 = 1 hour)
   * @returns {Promise<void>}
   */
  async set(key, value, ttl = 3600) {
    if (!this.isConnected || !this.client) {
      logger.debug({ key }, 'Cache set skipped - Redis not connected');
      return;
    }

    try {
      const serialized = JSON.stringify(value);
      await this.client.setEx(key, ttl, serialized);
      logger.debug({ key, ttl }, 'Cache set');
    } catch (error) {
      logger.warn({ error, key }, 'Cache set failed');
      // Don't throw - allow operation to continue
    }
  }

  /**
   * Get a value from cache
   * @param {string} key - Cache key
   * @returns {Promise<any|null>} - Cached value or null if not found
   */
  async get(key) {
    if (!this.isConnected || !this.client) {
      logger.debug({ key }, 'Cache get skipped - Redis not connected');
      return null;
    }

    try {
      const value = await this.client.get(key);
      if (value === null) {
        logger.debug({ key }, 'Cache miss');
        return null;
      }
      logger.debug({ key }, 'Cache hit');
      return JSON.parse(value);
    } catch (error) {
      logger.warn({ error, key }, 'Cache get failed');
      return null; // Return null on error - treat as cache miss
    }
  }

  /**
   * Delete one or more keys from cache
   * @param {string|string[]} keys - Key(s) to delete
   * @returns {Promise<number>} - Number of keys deleted
   */
  async del(keys) {
    if (!this.isConnected || !this.client) {
      logger.debug({ keys }, 'Cache del skipped - Redis not connected');
      return 0;
    }

    try {
      const keyArray = Array.isArray(keys) ? keys : [keys];
      const count = await this.client.del(keyArray);
      logger.debug({ keys: keyArray, count }, 'Cache keys deleted');
      return count;
    } catch (error) {
      logger.warn({ error, keys }, 'Cache del failed');
      return 0;
    }
  }

  /**
   * Check if a key exists in cache
   * @param {string} key - Cache key
   * @returns {Promise<boolean>}
   */
  async exists(key) {
    if (!this.isConnected || !this.client) {
      return false;
    }

    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      logger.warn({ error, key }, 'Cache exists check failed');
      return false;
    }
  }

  /**
   * Clear all cache data
   * WARNING: Use with caution - only for testing/admin operations
   * @returns {Promise<void>}
   */
  async clear() {
    if (!this.isConnected || !this.client) {
      logger.warn('Cache clear skipped - Redis not connected');
      return;
    }

    try {
      await this.client.flushAll();
      logger.warn('All cache data cleared');
    } catch (error) {
      logger.error({ error }, 'Cache clear failed');
      throw error;
    }
  }

  /**
   * Get value from cache or compute and cache it
   * Useful for expensive operations
   * @param {string} key - Cache key
   * @param {Function} computeFn - Function to compute value if cache miss
   * @param {number} ttl - Time to live in seconds
   * @returns {Promise<any>}
   */
  async getOrSet(key, computeFn, ttl = 3600) {
    // Try to get from cache first
    const cached = await this.get(key);
    if (cached !== null) {
      return cached;
    }

    // Cache miss - compute value
    logger.debug({ key }, 'Cache miss - computing value');
    const value = await computeFn();

    // Store in cache
    await this.set(key, value, ttl);

    return value;
  }

  /**
   * Close Redis connection
   * @returns {Promise<void>}
   */
  async close() {
    if (this.client && this.isConnected) {
      try {
        await this.client.quit();
        this.isConnected = false;
        logger.info('Redis connection closed');
      } catch (error) {
        logger.error({ error }, 'Error closing Redis connection');
      }
    }
  }
}

// Create singleton instance
const cacheService = new CacheService();

// Initialize on import (will be called when module is loaded)
if (config.redis.enabled) {
  cacheService.initialize().catch((error) => {
    logger.error({ error }, 'Failed to initialize cache service');
  });
}

export default cacheService;
