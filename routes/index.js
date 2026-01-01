import express from "express";
import healthRoutes from "./health.routes.js";
import authRoutes from "./auth.routes.js";
import usersRoutes from "./users.routes.js";
import organizationsRoutes from "./organizations.routes.js";
import featuresRoutes from "./features.routes.js";
import plansRoutes from "./plans.routes.js";
import rolesRoutes from "./roles.routes.js";
import overridesRoutes from "./overrides.routes.js";
import userPlansRoutes from "./user-plans.routes.js";
import permissionsRoutes from "./permissions.routes.js";
import usageRoutes from "./usage.routes.js";
import dashboardRoutes from "./dashboard.routes.js";

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
router.use("/admin", rolesRoutes); // Roles routes are under /api/admin
router.use("/admin", overridesRoutes); // Overrides routes are under /api/admin (organization routes) and /api/admin/overrides (user routes)
router.use("/admin", userPlansRoutes); // User plans routes are under /api/admin
router.use("/admin", usageRoutes); // Usage routes are under /api/admin
router.use("/admin", dashboardRoutes); // Dashboard routes are under /api/admin

// Permissions routes (authentication required)
router.use("/", permissionsRoutes); // Permissions routes are under /api/users/:userId/permissions and /api/me/permissions

export default router;
