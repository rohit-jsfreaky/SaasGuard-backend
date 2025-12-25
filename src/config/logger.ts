/**
 * Logger Configuration
 * Production-grade structured logging with Pino
 */

import pino from "pino";
import { isDevelopment } from "./environment.js";

/**
 * Log levels
 */
type LogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace";

/**
 * Get log level from environment
 */
function getLogLevel(): LogLevel {
  const level = (process.env["LOG_LEVEL"] || "info").toLowerCase();
  const validLevels: LogLevel[] = [
    "fatal",
    "error",
    "warn",
    "info",
    "debug",
    "trace",
  ];
  return validLevels.includes(level as LogLevel) ? (level as LogLevel) : "info";
}

/**
 * Create base logger configuration
 */
const baseOptions: pino.LoggerOptions = {
  level: getLogLevel(),
  formatters: {
    level: (label: string) => ({ level: label }),
    bindings: (bindings: pino.Bindings) => ({
      pid: bindings["pid"],
      host: bindings["hostname"],
      service: "saasguard-backend",
    }),
  },
  timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
  redact: {
    paths: [
      "password",
      "token",
      "authorization",
      "cookie",
      "secret",
      "*.password",
      "*.token",
      "req.headers.authorization",
      "req.headers.cookie",
    ],
    remove: true,
  },
};

/**
 * Development transport (pretty print)
 */
const devTransport: pino.TransportSingleOptions = {
  target: "pino-pretty",
  options: {
    colorize: true,
    translateTime: "HH:MM:ss.l",
    ignore: "pid,hostname",
    singleLine: false,
  },
};

/**
 * Production transport (JSON)
 */
const prodOptions: pino.LoggerOptions = {
  ...baseOptions,
};

/**
 * Create the logger instance
 */
export const logger = isDevelopment
  ? pino({ ...baseOptions, transport: devTransport })
  : pino(prodOptions);

/**
 * Create a child logger with context
 * @param context - Additional context for the logger
 */
export function createLogger(context: Record<string, unknown>) {
  return logger.child(context);
}

/**
 * Create a request-scoped logger
 * @param requestId - Unique request ID
 * @param userId - Optional user ID
 * @param orgId - Optional organization ID
 */
export function createRequestLogger(
  requestId: string,
  userId?: number,
  orgId?: number
) {
  return logger.child({
    requestId,
    ...(userId && { userId }),
    ...(orgId && { orgId }),
  });
}

/**
 * Log application startup
 */
export function logStartup(port: number, environment: string): void {
  logger.info(
    {
      event: "server_start",
      port,
      environment,
      nodeVersion: process.version,
      timestamp: new Date().toISOString(),
    },
    `🚀 SaaS Guard API running on port ${port} (${environment})`
  );
}

/**
 * Log application shutdown
 */
export function logShutdown(reason: string): void {
  logger.info(
    {
      event: "server_shutdown",
      reason,
      timestamp: new Date().toISOString(),
    },
    `🛑 Server shutting down: ${reason}`
  );
}

/**
 * Log database connection
 */
export function logDatabaseConnection(
  status: "connected" | "disconnected" | "error"
): void {
  const level = status === "error" ? "error" : "info";
  logger[level](
    {
      event: "database_connection",
      status,
      timestamp: new Date().toISOString(),
    },
    `Database ${status}`
  );
}

/**
 * Log Redis connection
 */
export function logRedisConnection(
  status: "connected" | "disconnected" | "error"
): void {
  const level = status === "error" ? "error" : "info";
  logger[level](
    {
      event: "redis_connection",
      status,
      timestamp: new Date().toISOString(),
    },
    `Redis ${status}`
  );
}

export default logger;
