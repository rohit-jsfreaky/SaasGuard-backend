import express, {
  type Request,
  type Response,
  type NextFunction,
  type ErrorRequestHandler,
} from "express";
import cors from "cors";
import { clerkMiddleware } from "@clerk/express";
import { env, isDevelopment } from "./config/environment.js";
import type {
  ApiErrorResponse,
  ApiResponse,
  UserContext,
} from "./types/index.js";
import { authMiddleware } from "./middleware/auth.middleware.js";
import featureRoutes from "./controllers/feature.controller.js";
import planRoutes from "./controllers/plan.controller.js";
import roleRoutes from "./controllers/role.controller.js";
import overrideRoutes from "./controllers/override.controller.js";
import usageRoutes from "./controllers/usage.controller.js";
import permissionRoutes from "./controllers/permission.controller.js";
import adminRoutes from "./routes/admin/index.js";

// Create Express application
const app = express();

// =============================================================================
// MIDDLEWARE
// =============================================================================

// CORS configuration
app.use(
  cors({
    origin: isDevelopment
      ? "*"
      : process.env["ALLOWED_ORIGINS"]?.split(",") || [],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// Parse JSON bodies
app.use(express.json({ limit: "10mb" }));

// Parse URL-encoded bodies
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Request logging in development
if (isDevelopment) {
  app.use((req: Request, _res: Response, next: NextFunction) => {
    console.log(`${new Date().toISOString()} | ${req.method} ${req.path}`);
    next();
  });
}

// Apply Clerk middleware globally (parses JWT from cookies/headers)
app.use(clerkMiddleware());

// =============================================================================
// ROUTES
// =============================================================================

// Health check endpoint
app.get(
  "/health",
  (
    _req: Request,
    res: Response<ApiResponse<{ status: string; timestamp: string }>>
  ) => {
    res.status(200).json({
      success: true,
      data: {
        status: "healthy",
        timestamp: new Date().toISOString(),
      },
    });
  }
);

// API version endpoint
app.get(
  "/api/v1",
  (
    _req: Request,
    res: Response<ApiResponse<{ version: string; name: string }>>
  ) => {
    res.status(200).json({
      success: true,
      data: {
        version: "1.0.0",
        name: "SaaS Guard API",
      },
    });
  }
);

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
app.use((_req: Request, res: Response<ApiErrorResponse>) => {
  res.status(404).json({
    success: false,
    error: {
      code: "NOT_FOUND",
      message: "The requested resource was not found",
    },
  });
});

// Global error handler - must be last
const errorHandler: ErrorRequestHandler = (
  err: Error & { statusCode?: number; code?: string },
  _req: Request,
  res: Response<ApiErrorResponse>,
  _next: NextFunction
) => {
  console.error("Error:", err);

  const statusCode = err.statusCode || 500;
  const code = err.code || "INTERNAL_SERVER_ERROR";
  const message = isDevelopment ? err.message : "An unexpected error occurred";

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      ...(isDevelopment && { details: { stack: err.stack } }),
    },
  });
};

app.use(errorHandler);

// =============================================================================
// SERVER STARTUP
// =============================================================================

const PORT = env.PORT;

const server = app.listen(PORT, () => {
  console.log("🚀 SaaS Guard API Server");
  console.log(`   Environment: ${env.NODE_ENV}`);
  console.log(`   Port: ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   API: http://localhost:${PORT}/api/v1`);
});

// Graceful shutdown
const shutdown = (signal: string) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  server.close(() => {
    console.log("HTTP server closed");
    process.exit(0);
  });

  // Force close after 10 seconds
  setTimeout(() => {
    console.error(
      "Could not close connections in time, forcefully shutting down"
    );
    process.exit(1);
  }, 10000);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

export default app;
