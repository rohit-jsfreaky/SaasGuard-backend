/**
 * Health Routes
 * Route definitions for health checks
 */

import { Router } from "express";
import { asyncHandler } from "../utils/async-handler.js";
import * as healthController from "../controllers/health.controller.js";

const router = Router();

/**
 * GET /health
 * Basic health check endpoint
 */
router.get("/", asyncHandler(healthController.getHealth));

/**
 * GET /health/live
 * Kubernetes liveness probe
 */
router.get("/live", healthController.getLiveness);

/**
 * GET /health/ready
 * Kubernetes readiness probe
 */
router.get("/ready", asyncHandler(healthController.getReadiness));

export default router;

