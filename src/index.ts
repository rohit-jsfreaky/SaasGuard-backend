import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import { clerkMiddleware } from "@clerk/express";
import { env, isDevelopment } from "./config/environment.js";
import { logger, logStartup } from "./config/logger.js";
import type { ApiResponse, UserContext } from "./types/index.js";
import { authMiddleware } from "./middleware/auth.middleware.js";
import { requestIdMiddleware } from "./middleware/request-id.middleware.js";
import {
  errorHandler,
  notFoundHandler,
} from "./middleware/error-handler.middleware.js";
import featureRoutes from "./controllers/feature.controller.js";
import planRoutes from "./controllers/plan.controller.js";
import roleRoutes from "./controllers/role.controller.js";
import overrideRoutes from "./controllers/override.controller.js";
import usageRoutes from "./controllers/usage.controller.js";
import permissionRoutes from "./controllers/permission.controller.js";
import healthRoutes from "./controllers/health.controller.js";
import adminRoutes from "./routes/admin/index.js";
import { swaggerSpec } from "./docs/swagger.js";
import { registerShutdownHandlers } from "./utils/graceful-shutdown.js";

// Create Express application
const app = express();

// =============================================================================
// CORE MIDDLEWARE
// =============================================================================

// Request ID for tracking
app.use(requestIdMiddleware);

// CORS configuration
const corsOrigins = process.env["CORS_ORIGINS"]?.split(",") || [];
app.use(
  cors({
    origin: isDevelopment ? "*" : corsOrigins,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Request-ID"],
    credentials: true,
  })
);

// Parse JSON bodies
app.use(express.json({ limit: "10mb" }));

// Parse URL-encoded bodies
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Request logging
if (process.env["ENABLE_REQUEST_LOGGING"] !== "false") {
  app.use((req: Request, _res: Response, next: NextFunction) => {
    logger.info(
      {
        requestId: req.requestId,
        method: req.method,
        path: req.path,
        query: Object.keys(req.query).length > 0 ? req.query : undefined,
      },
      `${req.method} ${req.path}`
    );
    next();
  });
}

// Apply Clerk middleware globally (parses JWT from cookies/headers)
app.use(clerkMiddleware());

// =============================================================================
// PUBLIC ROUTES (no authentication required)
// =============================================================================

// Health check endpoints
app.use("/health", healthRoutes);

// API version endpoint
app.get(
  "/api/v1",
  (
    _req: Request,
    res: Response<ApiResponse<{ version: string; name: string; docs: string }>>
  ) => {
    res.status(200).json({
      success: true,
      data: {
        version: "1.0.0",
        name: "SaaS Guard API",
        docs: "/api-docs",
      },
    });
  }
);

// =============================================================================
// API DOCUMENTATION
// =============================================================================

// Swagger UI - Interactive API documentation
app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customCss: ".swagger-ui .topbar { display: none }",
    customSiteTitle: "SaaS Guard API Documentation",
  })
);

// Raw OpenAPI spec as JSON
app.get("/api-docs/spec", (_req: Request, res: Response) => {
  res.setHeader("Content-Type", "application/json");
  res.send(swaggerSpec);
});

// =============================================================================
// PROTECTED ROUTES (require authentication)
// =============================================================================

// Apply auth middleware to all /api/v1/* routes (except public ones)
app.use("/api/v1", authMiddleware);

// Current user endpoint
app.get("/api/v1/me", (req, res: Response<ApiResponse<UserContext | null>>) => {
  res.status(200).json({
    success: true,
    data: req.user ?? null,
  });
});

// Mount API routes
app.use("/api/v1/admin/features", featureRoutes);
app.use("/api/v1/admin/plans", planRoutes);
app.use("/api/v1/admin", roleRoutes);
app.use("/api/v1/admin", overrideRoutes);
app.use("/api/v1/admin", usageRoutes);
app.use("/api/v1/admin", adminRoutes);
app.use("/api/v1", permissionRoutes);

// =============================================================================
// ERROR HANDLING
// =============================================================================

// 404 handler - must be after all routes
app.use(notFoundHandler);

// Global error handler - must be last
app.use(errorHandler);

// =============================================================================
// SERVER STARTUP
// =============================================================================

const PORT = env.PORT;

const server = app.listen(PORT, () => {
  logStartup(PORT, env.NODE_ENV);

  if (isDevelopment) {
    console.log("");
    console.log("📍 Available endpoints:");
    console.log(`   Health:  http://localhost:${PORT}/health`);
    console.log(`   API:     http://localhost:${PORT}/api/v1`);
    console.log(`   Docs:    http://localhost:${PORT}/api-docs`);
    console.log("");
  }
});

// Register graceful shutdown handlers
registerShutdownHandlers(server);

export default app;
