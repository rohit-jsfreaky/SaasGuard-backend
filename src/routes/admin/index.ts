/**
 * Admin Routes Index
 * Central export for all admin routes
 */

import { Router } from "express";
import usersRoutes from "./users.routes.js";
import organizationsRoutes from "./organizations.routes.js";
import dashboardRoutes from "./dashboard.routes.js";

const router = Router();

// Mount all admin routes
router.use(usersRoutes);
router.use(organizationsRoutes);
router.use(dashboardRoutes);

export default router;
