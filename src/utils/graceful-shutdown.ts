/**
 * Graceful Shutdown Handler
 * Ensures clean shutdown of all connections
 */

import type { Server } from "http";
import { pool } from "../db/index.js";
import { logger, logShutdown } from "../config/logger.js";

/**
 * Shutdown state
 */
let isShuttingDown = false;

/**
 * Register shutdown handlers
 * @param server - HTTP server instance
 */
export function registerShutdownHandlers(server: Server): void {
  // Handle SIGTERM (Docker, Kubernetes)
  process.on("SIGTERM", () => handleShutdown(server, "SIGTERM"));

  // Handle SIGINT (Ctrl+C)
  process.on("SIGINT", () => handleShutdown(server, "SIGINT"));

  // Handle uncaught exceptions
  process.on("uncaughtException", (error) => {
    logger.fatal(
      { error: error.message, stack: error.stack },
      "Uncaught exception"
    );
    handleShutdown(server, "uncaughtException");
  });

  // Handle unhandled promise rejections
  process.on("unhandledRejection", (reason) => {
    logger.fatal({ reason }, "Unhandled promise rejection");
    handleShutdown(server, "unhandledRejection");
  });
}

/**
 * Handle graceful shutdown
 * @param server - HTTP server instance
 * @param signal - Signal that triggered shutdown
 */
async function handleShutdown(server: Server, signal: string): Promise<void> {
  // Prevent multiple shutdown attempts
  if (isShuttingDown) {
    logger.warn("Shutdown already in progress");
    return;
  }

  isShuttingDown = true;
  logShutdown(signal);

  // Set a timeout for forced shutdown
  const forceShutdownTimeout = setTimeout(() => {
    logger.error("Forced shutdown after timeout");
    process.exit(1);
  }, 30000); // 30 seconds

  try {
    // 1. Stop accepting new connections
    logger.info("Closing HTTP server...");
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) {
          logger.error({ error: err.message }, "Error closing HTTP server");
          reject(err);
        } else {
          logger.info("HTTP server closed");
          resolve();
        }
      });
    });

    // 2. Close database connection pool
    logger.info("Closing database connection...");
    try {
      await pool.end();
      logger.info("Database connection closed");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error({ error: message }, "Error closing database connection");
    }

    // 3. Cache connections are typically stateless (Upstash REST)
    logger.info("Cache connections closed (stateless)");

    // Clean exit
    clearTimeout(forceShutdownTimeout);
    logger.info("Graceful shutdown complete");
    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error({ error: message }, "Error during graceful shutdown");
    clearTimeout(forceShutdownTimeout);
    process.exit(1);
  }
}

/**
 * Check if server is shutting down
 */
export function isServerShuttingDown(): boolean {
  return isShuttingDown;
}

export default registerShutdownHandlers;
