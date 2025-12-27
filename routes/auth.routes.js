import express from 'express';
import asyncHandler from '../utilities/async-handler.js';
import { authenticate, authenticateWithUserInfo } from '../middlewares/auth.middleware.js';
import clerkService from '../services/clerk.service.js';

const router = express.Router();

/**
 * GET /auth/me
 * Get current authenticated user info
 * Requires authentication
 */
router.get('/me', authenticate, asyncHandler(async (req, res) => {
  // req.user is already set by authenticate middleware
  res.json({
    success: true,
    data: {
      id: req.user.id,
      email: req.user.email,
      orgId: req.user.orgId
    }
  });
}));

/**
 * GET /auth/me/full
 * Get full user info from Clerk (includes name, image, etc.)
 * Requires authentication + fetches full user details
 */
router.get('/me/full', authenticateWithUserInfo, asyncHandler(async (req, res) => {
  // req.user is enhanced with full user info by authenticateWithUserInfo middleware
  res.json({
    success: true,
    data: req.user
  });
}));

/**
 * POST /auth/verify
 * Verify a token (useful for testing)
 * Requires authentication
 */
router.post('/verify', authenticate, asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: {
      message: 'Token is valid',
      userId: req.userId,
      user: req.user
    }
  });
}));

export default router;
