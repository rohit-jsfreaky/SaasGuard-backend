/**
 * Example Protected Routes
 * Demonstrates how to use authorization and rate limit middleware
 *
 * These routes show best practices for protecting API endpoints
 */

import { Router, type Request, type Response } from "express";
import { authorize, authorizeAll } from "../middleware/authorize.middleware.js";
import {
  enforceLimit,
  recordUsage,
  authorizeAndLimit,
} from "../middleware/rate-limit.middleware.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import type { ApiResponse, ApiErrorResponse } from "../types/index.js";

const router = Router();

// ============================================================================
// EXAMPLE 1: Simple feature authorization
// Checks if user has 'create_post' feature enabled
// ============================================================================

/**
 * POST /posts
 * Creates a new post
 *
 * Required permissions:
 * - create_post (feature must be enabled)
 * - create_post limit not exceeded
 */
router.post(
  "/posts",
  requireAuth,
  authorizeAndLimit("create_post"),
  async (
    req: Request,
    res: Response<ApiResponse<{ id: string; title: string }> | ApiErrorResponse>
  ): Promise<void> => {
    try {
      const { title } = req.body as { title?: string };

      if (!title) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Title is required" },
        });
        return;
      }

      // Simulate creating a post
      const newPost = {
        id: `post_${Date.now()}`,
        title,
      };

      // Record usage AFTER successful action
      await recordUsage(req, "create_post", 1);

      res.status(201).json({
        success: true,
        data: newPost,
        message: "Post created successfully",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create post";
      res.status(500).json({
        success: false,
        error: { code: "CREATE_FAILED", message },
      });
    }
  }
);

// ============================================================================
// EXAMPLE 2: Simple feature check (no limit)
// Checks if user has 'delete_post' feature enabled
// ============================================================================

/**
 * DELETE /posts/:id
 * Deletes a post
 *
 * Required permissions:
 * - delete_post (feature must be enabled)
 */
router.delete(
  "/posts/:id",
  requireAuth,
  authorize("delete_post"),
  async (
    req: Request,
    res: Response<ApiResponse<{ deleted: boolean }> | ApiErrorResponse>
  ): Promise<void> => {
    try {
      const { id } = req.params;

      // Simulate deleting a post
      console.log(`Deleting post: ${id}`);

      res.status(200).json({
        success: true,
        data: { deleted: true },
        message: "Post deleted successfully",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to delete post";
      res.status(500).json({
        success: false,
        error: { code: "DELETE_FAILED", message },
      });
    }
  }
);

// ============================================================================
// EXAMPLE 3: Multiple features required
// User must have ALL of these features
// ============================================================================

/**
 * GET /posts/export
 * Exports all posts to CSV
 *
 * Required permissions:
 * - export_data (feature must be enabled)
 * - view_posts (feature must be enabled)
 */
router.get(
  "/posts/export",
  requireAuth,
  authorizeAll(["export_data", "view_posts"]),
  async (
    req: Request,
    res: Response<ApiResponse<{ downloadUrl: string }> | ApiErrorResponse>
  ): Promise<void> => {
    try {
      // Simulate generating export
      const downloadUrl = `/downloads/export_${Date.now()}.csv`;

      // Record export usage
      await recordUsage(req, "export_data", 1);

      res.status(200).json({
        success: true,
        data: { downloadUrl },
        message: "Export generated successfully",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to export";
      res.status(500).json({
        success: false,
        error: { code: "EXPORT_FAILED", message },
      });
    }
  }
);

// ============================================================================
// EXAMPLE 4: Rate limit only (useful for API calls)
// No feature check, just rate limiting
// ============================================================================

/**
 * POST /api/search
 * Search API with rate limiting
 *
 * Required permissions:
 * - api_calls limit not exceeded
 */
router.post(
  "/api/search",
  requireAuth,
  enforceLimit("api_calls"),
  async (
    req: Request,
    res: Response<ApiResponse<{ results: string[] }> | ApiErrorResponse>
  ): Promise<void> => {
    try {
      const { query } = req.body as { query?: string };

      // Simulate search
      const results = query
        ? [`Result 1 for "${query}"`, `Result 2 for "${query}"`]
        : [];

      // Record API call usage
      await recordUsage(req, "api_calls", 1);

      res.status(200).json({
        success: true,
        data: { results },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Search failed";
      res.status(500).json({
        success: false,
        error: { code: "SEARCH_FAILED", message },
      });
    }
  }
);

// ============================================================================
// EXAMPLE 5: Custom rate limit
// Override plan limit with a custom value
// ============================================================================

/**
 * POST /api/heavy-operation
 * Limited to 5 per day regardless of plan
 */
router.post(
  "/api/heavy-operation",
  requireAuth,
  enforceLimit("heavy_operation", 5), // Custom limit of 5
  async (
    req: Request,
    res: Response<ApiResponse<{ processed: boolean }> | ApiErrorResponse>
  ): Promise<void> => {
    try {
      // Simulate heavy operation
      console.log("Running heavy operation...");

      // Record usage
      await recordUsage(req, "heavy_operation", 1);

      res.status(200).json({
        success: true,
        data: { processed: true },
        message: "Operation completed",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Operation failed";
      res.status(500).json({
        success: false,
        error: { code: "OPERATION_FAILED", message },
      });
    }
  }
);

export default router;
