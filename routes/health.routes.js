import express from "express";
import asyncHandler from "../utilities/async-handler.js";
import { pool } from "../config/db.js";
import cacheService from "../services/cache.service.js";
import logger from "../utilities/logger.js";

const router = express.Router();

/**
 * GET /health
 * Enhanced health check endpoint with dependency status
 */
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const checks = {
      database: "unknown",
      redis: "unknown",
    };

    let overallStatus = "ok";

    // Check database connection
    try {
      const client = await pool.connect();
      await client.query("SELECT 1");
      client.release();
      checks.database = "ok";
    } catch (error) {
      logger.error({ error: error.message }, "Database health check failed");
      checks.database = "error";
      overallStatus = "degraded";
    }

    // Check Redis connection
    try {
      if (cacheService.isConnected) {
        checks.redis = "ok";
      } else {
        checks.redis = "disconnected";
        // Redis is optional, so we don't mark as degraded
      }
    } catch (error) {
      logger.warn({ error: error.message }, "Redis health check failed");
      checks.redis = "error";
    }

    // Determine HTTP status
    const httpStatus = overallStatus === "ok" ? 200 : 503;

    res.status(httpStatus).json({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || "1.0.0",
      uptime: Math.floor(process.uptime()),
      environment: process.env.NODE_ENV || "development",
      checks,
    });
  })
);

/**
 * GET /health/ready
 * Readiness probe - checks if app can handle requests
 */
router.get(
  "/ready",
  asyncHandler(async (req, res) => {
    try {
      // Check database is ready
      const client = await pool.connect();
      await client.query("SELECT 1");
      client.release();

      res.json({
        ready: true,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      res.status(503).json({
        ready: false,
        reason: "Database not ready",
        timestamp: new Date().toISOString(),
      });
    }
  })
);

/**
 * GET /health/live
 * Liveness probe - checks if app is running
 */
router.get("/live", (req, res) => {
  res.json({
    alive: true,
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
  });
});

export default router;
