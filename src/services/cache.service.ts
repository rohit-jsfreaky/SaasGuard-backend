import { createClient, type RedisClientType } from "redis";
import { env, isDevelopment } from "../config/environment.js";

/**
 * Default TTL values in seconds for different cache types
 */
export const CacheTTL = {
  /** Permission cache TTL - 5 minutes */
  PERMISSIONS: 5 * 60,
  /** Feature cache TTL - 24 hours */
  FEATURES: 24 * 60 * 60,
  /** Plan cache TTL - 1 hour */
  PLANS: 60 * 60,
  /** Role cache TTL - 1 hour */
  ROLES: 60 * 60,
  /** Usage cache TTL - 5 minutes */
  USAGE: 5 * 60,
  /** Override cache TTL - 5 minutes */
  OVERRIDES: 5 * 60,
  /** Default TTL - 1 hour */
  DEFAULT: 60 * 60,
} as const;

/**
 * Redis Cache Service
 * Provides caching functionality with graceful fallback when Redis is unavailable
 */
class CacheService {
  private client: RedisClientType | null = null;
  private isConnected = false;
  private connectionPromise: Promise<void> | null = null;

  /**
   * Initialize Redis connection
   */
  async connect(): Promise<void> {
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = this._connect();
    return this.connectionPromise;
  }

  private async _connect(): Promise<void> {
    try {
      this.client = createClient({
        url: env.REDIS_URL,
        socket: {
          connectTimeout: 10000,
          reconnectStrategy: (retries) => {
            if (retries > 5) {
              console.warn(
                "⚠️ Redis: Max reconnection attempts reached, running without cache"
              );
              return false;
            }
            return Math.min(retries * 100, 3000);
          },
        },
      });

      this.client.on("error", (err) => {
        console.error("❌ Redis Client Error:", err.message);
        this.isConnected = false;
      });

      this.client.on("connect", () => {
        if (isDevelopment) {
          console.log("🔄 Redis: Connecting...");
        }
      });

      this.client.on("ready", () => {
        console.log("✅ Redis: Connected and ready");
        this.isConnected = true;
      });

      this.client.on("end", () => {
        console.log("🔌 Redis: Connection closed");
        this.isConnected = false;
      });

      await this.client.connect();
    } catch (error) {
      console.warn(
        "⚠️ Redis: Failed to connect, running without cache:",
        (error as Error).message
      );
      this.isConnected = false;
      this.client = null;
    }
  }

  /**
   * Check if Redis is available
   */
  isAvailable(): boolean {
    return this.isConnected && this.client !== null;
  }

  /**
   * Set a value in cache with optional TTL
   * @param key - Cache key
   * @param value - Value to cache (will be JSON serialized)
   * @param ttl - Time to live in seconds (default: 1 hour)
   */
  async set(
    key: string,
    value: unknown,
    ttl: number = CacheTTL.DEFAULT
  ): Promise<void> {
    if (!this.isAvailable()) {
      if (isDevelopment) {
        console.debug(`[Cache] SKIP SET: ${key} (Redis unavailable)`);
      }
      return;
    }

    try {
      const serialized = JSON.stringify(value);
      await this.client!.setEx(key, ttl, serialized);
      if (isDevelopment) {
        console.debug(`[Cache] SET: ${key} (TTL: ${ttl}s)`);
      }
    } catch (error) {
      console.error(`[Cache] SET Error for ${key}:`, (error as Error).message);
    }
  }

  /**
   * Get a value from cache
   * @param key - Cache key
   * @returns Deserialized value or null if not found
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.isAvailable()) {
      if (isDevelopment) {
        console.debug(`[Cache] SKIP GET: ${key} (Redis unavailable)`);
      }
      return null;
    }

    try {
      const value = await this.client!.get(key);
      if (value === null) {
        if (isDevelopment) {
          console.debug(`[Cache] MISS: ${key}`);
        }
        return null;
      }

      if (isDevelopment) {
        console.debug(`[Cache] HIT: ${key}`);
      }
      return JSON.parse(value) as T;
    } catch (error) {
      console.error(`[Cache] GET Error for ${key}:`, (error as Error).message);
      return null;
    }
  }

  /**
   * Delete one or more keys from cache
   * @param keys - Single key or array of keys to delete
   * @returns Number of keys deleted
   */
  async del(keys: string | string[]): Promise<number> {
    if (!this.isAvailable()) {
      return 0;
    }

    try {
      const keysArray = Array.isArray(keys) ? keys : [keys];
      if (keysArray.length === 0) {
        return 0;
      }

      const count = await this.client!.del(keysArray);
      if (isDevelopment) {
        console.debug(
          `[Cache] DEL: ${keysArray.join(", ")} (deleted: ${count})`
        );
      }
      return count;
    } catch (error) {
      console.error(`[Cache] DEL Error:`, (error as Error).message);
      return 0;
    }
  }

  /**
   * Check if a key exists in cache
   * @param key - Cache key
   * @returns True if key exists
   */
  async exists(key: string): Promise<boolean> {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      const result = await this.client!.exists(key);
      return result === 1;
    } catch (error) {
      console.error(
        `[Cache] EXISTS Error for ${key}:`,
        (error as Error).message
      );
      return false;
    }
  }

  /**
   * Get value from cache or compute and store it
   * @param key - Cache key
   * @param fn - Function to compute value if not cached
   * @param ttl - Time to live in seconds
   * @returns Cached or computed value
   */
  async getOrSet<T>(
    key: string,
    fn: () => Promise<T>,
    ttl: number = CacheTTL.DEFAULT
  ): Promise<T> {
    // Try to get from cache first
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Compute the value
    const value = await fn();

    // Store in cache (fire and forget)
    void this.set(key, value, ttl);

    return value;
  }

  /**
   * Clear all keys matching a pattern
   * @param pattern - Key pattern (e.g., "user:*")
   * @returns Number of keys deleted
   */
  async clearPattern(pattern: string): Promise<number> {
    if (!this.isAvailable()) {
      return 0;
    }

    try {
      const keys = await this.client!.keys(pattern);
      if (keys.length === 0) {
        return 0;
      }

      const count = await this.client!.del(keys);
      if (isDevelopment) {
        console.debug(`[Cache] CLEAR PATTERN: ${pattern} (deleted: ${count})`);
      }
      return count;
    } catch (error) {
      console.error(`[Cache] CLEAR PATTERN Error:`, (error as Error).message);
      return 0;
    }
  }

  /**
   * Clear all cache keys (use with caution)
   */
  async clear(): Promise<void> {
    if (!this.isAvailable()) {
      return;
    }

    try {
      await this.client!.flushDb();
      console.log("[Cache] All keys cleared");
    } catch (error) {
      console.error(`[Cache] CLEAR Error:`, (error as Error).message);
    }
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
      this.isConnected = false;
      this.connectionPromise = null;
    }
  }

  /**
   * Get cache statistics (for debugging)
   */
  async getStats(): Promise<{ connected: boolean; keyCount?: number }> {
    if (!this.isAvailable()) {
      return { connected: false };
    }

    try {
      const keyCount = await this.client!.dbSize();
      return { connected: true, keyCount };
    } catch {
      return { connected: true };
    }
  }
}

/**
 * Singleton cache service instance
 */
export const cacheService = new CacheService();
