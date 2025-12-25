import { Router, type Request, type Response } from "express";
import { usageService } from "../services/usage.service.js";
import { RecordUsageSchema } from "../validators/usage.validator.js";
import type { ApiResponse, ApiErrorResponse } from "../types/index.js";
import type { Usage } from "../types/db.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { triggerManualReset } from "../jobs/reset-usage.job.js";

const router = Router();

/**
 * Usage list response type
 */
interface UsageListResponse {
  usage: Usage[];
  total: number;
}

/**
 * Usage stats response type
 */
interface UsageStatsResponse {
  totalUsers: number;
  totalUsage: number;
  avgUsage: number;
}

// =============================================================================
// USER USAGE ROUTES
// =============================================================================

/**
 * POST /admin/users/:userId/usage/:featureSlug
 * Record usage for a user and feature
 */
router.post(
  "/users/:userId/usage/:featureSlug",
  requireAuth,
  async (
    req: Request,
    res: Response<ApiResponse<Usage> | ApiErrorResponse>
  ): Promise<void> => {
    try {
      const { userId, featureSlug } = req.params;
      const userIdNum = parseInt(userId ?? "", 10);

      if (isNaN(userIdNum) || !featureSlug) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Invalid parameters" },
        });
        return;
      }

      const parsed = RecordUsageSchema.safeParse(req.body);
      const amount = parsed.success ? parsed.data.amount : 1;

      const usage = await usageService.recordUsage(
        userIdNum,
        featureSlug,
        amount
      );

      res.status(200).json({
        success: true,
        data: usage,
        message: `Usage recorded: +${amount}`,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to record usage";
      res.status(500).json({
        success: false,
        error: { code: "RECORD_FAILED", message },
      });
    }
  }
);

/**
 * GET /admin/users/:userId/usage
 * Get all usage for a user
 */
router.get(
  "/users/:userId/usage",
  async (
    req: Request,
    res: Response<ApiResponse<UsageListResponse> | ApiErrorResponse>
  ): Promise<void> => {
    try {
      const { userId } = req.params;
      const userIdNum = parseInt(userId ?? "", 10);

      if (isNaN(userIdNum)) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Invalid user ID" },
        });
        return;
      }

      const usage = await usageService.getUserUsage(userIdNum);

      res.status(200).json({
        success: true,
        data: { usage, total: usage.length },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to get usage";
      res.status(500).json({
        success: false,
        error: { code: "GET_FAILED", message },
      });
    }
  }
);

/**
 * GET /admin/users/:userId/usage/:featureSlug
 * Get usage for a specific feature
 */
router.get(
  "/users/:userId/usage/:featureSlug",
  async (
    req: Request,
    res: Response<ApiResponse<Usage | null> | ApiErrorResponse>
  ): Promise<void> => {
    try {
      const { userId, featureSlug } = req.params;
      const userIdNum = parseInt(userId ?? "", 10);

      if (isNaN(userIdNum) || !featureSlug) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Invalid parameters" },
        });
        return;
      }

      const usage = await usageService.getUsage(userIdNum, featureSlug);

      res.status(200).json({
        success: true,
        data: usage,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to get usage";
      res.status(500).json({
        success: false,
        error: { code: "GET_FAILED", message },
      });
    }
  }
);

/**
 * POST /admin/users/:userId/usage/:featureSlug/reset
 * Reset usage for a specific feature
 */
router.post(
  "/users/:userId/usage/:featureSlug/reset",
  requireAuth,
  async (
    req: Request,
    res: Response<ApiResponse<{ reset: boolean }> | ApiErrorResponse>
  ): Promise<void> => {
    try {
      const { userId, featureSlug } = req.params;
      const userIdNum = parseInt(userId ?? "", 10);

      if (isNaN(userIdNum) || !featureSlug) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Invalid parameters" },
        });
        return;
      }

      await usageService.resetUsage(userIdNum, featureSlug);

      res.status(200).json({
        success: true,
        data: { reset: true },
        message: "Usage reset successfully",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to reset usage";
      res.status(500).json({
        success: false,
        error: { code: "RESET_FAILED", message },
      });
    }
  }
);

/**
 * POST /admin/users/:userId/usage/reset-all
 * Reset all usage for a user
 */
router.post(
  "/users/:userId/usage/reset-all",
  requireAuth,
  async (
    req: Request,
    res: Response<ApiResponse<{ reset: boolean }> | ApiErrorResponse>
  ): Promise<void> => {
    try {
      const { userId } = req.params;
      const userIdNum = parseInt(userId ?? "", 10);

      if (isNaN(userIdNum)) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Invalid user ID" },
        });
        return;
      }

      await usageService.resetAllUsageForUser(userIdNum);

      res.status(200).json({
        success: true,
        data: { reset: true },
        message: "All usage reset successfully",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to reset usage";
      res.status(500).json({
        success: false,
        error: { code: "RESET_FAILED", message },
      });
    }
  }
);

// =============================================================================
// ADMIN ROUTES
// =============================================================================

/**
 * POST /admin/usage/reset-all
 * Reset all monthly usage (admin only)
 */
router.post(
  "/usage/reset-all",
  requireAuth,
  async (
    _req: Request,
    res: Response<ApiResponse<{ count: number }> | ApiErrorResponse>
  ): Promise<void> => {
    try {
      const count = await triggerManualReset();

      res.status(200).json({
        success: true,
        data: { count },
        message: `Reset ${count} usage records`,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to reset usage";
      res.status(500).json({
        success: false,
        error: { code: "RESET_FAILED", message },
      });
    }
  }
);

/**
 * GET /admin/usage/stats/:featureSlug
 * Get usage statistics for a feature
 */
router.get(
  "/usage/stats/:featureSlug",
  async (
    req: Request,
    res: Response<ApiResponse<UsageStatsResponse> | ApiErrorResponse>
  ): Promise<void> => {
    try {
      const { featureSlug } = req.params;

      if (!featureSlug) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Feature slug required" },
        });
        return;
      }

      const stats = await usageService.getFeatureUsageStats(featureSlug);

      res.status(200).json({
        success: true,
        data: stats,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to get stats";
      res.status(500).json({
        success: false,
        error: { code: "STATS_FAILED", message },
      });
    }
  }
);

export default router;
