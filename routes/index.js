import express from "express";
import healthRoutes from "./health.routes.js";
import authRoutes from "./auth.routes.js";
import usersRoutes from "./users.routes.js";
import organizationsRoutes from "./organizations.routes.js";
import featuresRoutes from "./features.routes.js";
import plansRoutes from "./plans.routes.js";

const router = express.Router();

// Public routes (no authentication required)
router.use("/health", healthRoutes);

// Protected routes (authentication required)
router.use("/auth", authRoutes);
router.use("/users", usersRoutes);
router.use("/organizations", organizationsRoutes);

// Admin routes (authentication + admin required)
// Note: Frontend should call /api/admin/features (the /api prefix comes from how you mount this router)
router.use("/admin/features", featuresRoutes);
router.use("/admin", plansRoutes); // Plans routes are under /api/admin

// Placeholder routes - will be implemented in later features
// router.use('/admin/roles', rolesRoutes);
// router.use('/admin/overrides', overridesRoutes);
// router.use('/admin/usage', usageRoutes);
// router.use('/permissions', permissionsRoutes);

export default router;
