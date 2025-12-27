import express from 'express';
import healthRoutes from './health.routes.js';
import authRoutes from './auth.routes.js';
import usersRoutes from './users.routes.js';
import organizationsRoutes from './organizations.routes.js';

const router = express.Router();

// Public routes (no authentication required)
router.use('/health', healthRoutes);

// Protected routes (authentication required)
router.use('/auth', authRoutes);
router.use('/users', usersRoutes);
router.use('/organizations', organizationsRoutes);

// Placeholder routes - will be implemented in later features
// router.use('/features', featuresRoutes);
// router.use('/plans', plansRoutes);
// router.use('/roles', rolesRoutes);
// router.use('/overrides', overridesRoutes);
// router.use('/usage', usageRoutes);
// router.use('/permissions', permissionsRoutes);
// router.use('/admin', adminRoutes);

export default router;

