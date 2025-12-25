/**
 * Health Check Controller
 * Provides endpoints for monitoring system health
 */

import { Router, type Request, type Response } from "express";
import { db } from "../db/index.js";
import { cacheService } from "../services/cache.service.js";
import { sql } from "drizzle-orm";
import { logger } from "../config/logger.js";

const router = Router();

/**
 * Health status response
 */
interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  version: string;
  uptime: number;
  checks: {
    database: { status: "ok" | "error"; latency?: number; error?: string };
    cache: { status: "ok" | "error"; latency?: number; error?: string };
  };
}

/**
 * Get version from package.json
 */
const VERSION = process.env["npm_package_version"] || "1.0.0";

/**
 * Server start time for uptime calculation
 */
const startTime = Date.now();

/**
 * Check database connectivity
 */
async function checkDatabase(): Promise<{
  status: "ok" | "error";
  latency?: number;
  error?: string;
}> {
  const start = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    return { status: "ok", latency: Date.now() - start };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error({ error: message }, "Database health check failed");
    return { status: "error", error: message };
  }
}

/**
 * Check Redis connectivity
 */
async function checkCache(): Promise<{
  status: "ok" | "error";
  latency?: number;
  error?: string;
}> {
  const start = Date.now();
  try {
    await cacheService.set("health:check", "ok", 10);
    const result = await cacheService.get<string>("health:check");
    if (result === "ok") {
      return { status: "ok", latency: Date.now() - start };
    }
    return { status: "error", error: "Cache write/read mismatch" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error({ error: message }, "Cache health check failed");
    return { status: "error", error: message };
  }
}

/**
 * GET /health
 * Basic health check endpoint
 */
router.get("/", async (_req: Request, res: Response<HealthStatus>) => {
  const dbCheck = await checkDatabase();
  const cacheCheck = await checkCache();

  const allHealthy = dbCheck.status === "ok" && cacheCheck.status === "ok";
  const anyHealthy = dbCheck.status === "ok" || cacheCheck.status === "ok";

  const status: HealthStatus = {
    status: allHealthy ? "healthy" : anyHealthy ? "degraded" : "unhealthy",
    timestamp: new Date().toISOString(),
    version: VERSION,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    checks: {
      database: dbCheck,
      cache: cacheCheck,
    },
  };

  const statusCode =
    status.status === "healthy"
      ? 200
      : status.status === "degraded"
      ? 200
      : 503;
  res.status(statusCode).json(status);
});

/**
 * GET /health/live
 * Kubernetes liveness probe
 * Returns 200 if server is running
 */
router.get("/live", (_req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /health/ready
 * Kubernetes readiness probe
 * Returns 200 if server is ready to accept traffic
 */
router.get("/ready", async (_req: Request, res: Response) => {
  const dbCheck = await checkDatabase();

  if (dbCheck.status === "ok") {
    res.status(200).json({
      status: "ready",
      timestamp: new Date().toISOString(),
    });
  } else {
    res.status(503).json({
      status: "not_ready",
      timestamp: new Date().toISOString(),
      error: "Database not available",
    });
  }
});

export default router;
