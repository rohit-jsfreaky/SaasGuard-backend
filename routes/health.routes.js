import express from 'express';
import asyncHandler from '../utilities/async-handler.js';

const router = express.Router();

/**
 * GET /health
 * Health check endpoint
 */
router.get('/', asyncHandler(async (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    uptime: process.uptime()
  });
}));

export default router;

