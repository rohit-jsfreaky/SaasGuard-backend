/**
 * Usage Controller
 * Pure controller functions for usage management
 */

import type { Request, Response } from "express";
import { usageService } from "../services/usage.service.js";
import { RecordUsageSchema } from "../validators/usage.validator.js";
import type { ApiResponse } from "../types/index.js";
import type { Usage } from "../types/db.js";
import { triggerManualReset } from "../jobs/reset-usage.job.js";
import { ValidationError } from "../utils/errors.js";
import { successResponse } from "../utils/async-handler.js";

/**
 * Usage list response type
 */
export interface UsageListResponse {
  usage: Usage[];
  total: number;
}

/**
 * Usage stats response type
 */
export interface UsageStatsResponse {
  totalUsers: number;
  totalUsage: number;
  avgUsage: number;
}

// =============================================================================
// USER USAGE CONTROLLERS
// =============================================================================

/**
 * Record usage for a user and feature
 */
export async function recordUsage(
  req: Request,
  res: Response
): Promise<ApiResponse<Usage>> {
  const { userId, featureSlug } = req.params;
  const trimmedUserId = userId?.trim();

  if (!trimmedUserId || !featureSlug) {
    throw new ValidationError("Invalid parameters");
  }

  const parsed = RecordUsageSchema.safeParse(req.body);
  const amount = parsed.success ? parsed.data.amount : 1;

  const usage = await usageService.recordUsage(trimmedUserId, featureSlug, amount);

  return successResponse(usage, `Usage recorded: +${amount}`).response;
}

/**
 * Get all usage for a user
 */
export async function getUserUsage(
  req: Request,
  res: Response
): Promise<ApiResponse<UsageListResponse>> {
  const { userId } = req.params;
  const trimmedUserId = userId?.trim();

  if (!trimmedUserId) {
    throw new ValidationError("Invalid user ID");
  }

  const usage = await usageService.getUserUsage(trimmedUserId);

  return successResponse({ usage, total: usage.length }).response;
}

/**
 * Get usage for a specific feature
 */
export async function getUsage(
  req: Request,
  res: Response
): Promise<ApiResponse<Usage | null>> {
  const { userId, featureSlug } = req.params;
  const trimmedUserId = userId?.trim();

  if (!trimmedUserId || !featureSlug) {
    throw new ValidationError("Invalid parameters");
  }

  const usage = await usageService.getUsage(trimmedUserId, featureSlug);

  return successResponse(usage).response;
}

/**
 * Reset usage for a specific feature
 */
export async function resetUsage(
  req: Request,
  res: Response
): Promise<ApiResponse<{ reset: boolean }>> {
  const { userId, featureSlug } = req.params;
  const trimmedUserId = userId?.trim();

  if (!trimmedUserId || !featureSlug) {
    throw new ValidationError("Invalid parameters");
  }

  await usageService.resetUsage(trimmedUserId, featureSlug);

  return successResponse({ reset: true }, "Usage reset successfully").response;
}

/**
 * Reset all usage for a user
 */
export async function resetAllUsageForUser(
  req: Request,
  res: Response
): Promise<ApiResponse<{ reset: boolean }>> {
  const { userId } = req.params;
  const trimmedUserId = userId?.trim();

  if (!trimmedUserId) {
    throw new ValidationError("Invalid user ID");
  }

  await usageService.resetAllUsageForUser(trimmedUserId);

  return successResponse({ reset: true }, "All usage reset successfully").response;
}

// =============================================================================
// ADMIN CONTROLLERS
// =============================================================================

/**
 * Reset all monthly usage (admin only)
 */
export async function resetAllUsage(
  req: Request,
  res: Response
): Promise<ApiResponse<{ count: number }>> {
  const count = await triggerManualReset();

  return successResponse({ count }, `Reset ${count} usage records`).response;
}

/**
 * Get usage statistics for a feature
 */
export async function getFeatureUsageStats(
  req: Request,
  res: Response
): Promise<ApiResponse<UsageStatsResponse>> {
  const { featureSlug } = req.params;

  if (!featureSlug) {
    throw new ValidationError("Feature slug required");
  }

  const stats = await usageService.getFeatureUsageStats(featureSlug);

  return successResponse(stats).response;
}
