import express from 'express';
import healthRoutes from './health.routes.js';

const router = express.Router();

// Health check route
router.use('/health', healthRoutes);

// Placeholder routes - will be implemented in later features
// router.use('/auth', authRoutes);
// router.use('/users', usersRoutes);
// router.use('/organizations', organizationsRoutes);
// router.use('/features', featuresRoutes);
// router.use('/plans', plansRoutes);
// router.use('/roles', rolesRoutes);
// router.use('/overrides', overridesRoutes);
// router.use('/usage', usageRoutes);
// router.use('/permissions', permissionsRoutes);
// router.use('/admin', adminRoutes);

export default router;

