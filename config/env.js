import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const requiredEnvVars = ["DATABASE_URL", "CLERK_SECRET_KEY"];

// Validate required environment variables
const missingVars = requiredEnvVars.filter((varName) => !process.env[varName]);

if (missingVars.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missingVars.join(", ")}\n` +
      "Please check your .env file and ensure all required variables are set."
  );
}

const isProduction = process.env.NODE_ENV === "production";

const config = {
  env: process.env.NODE_ENV || "development",
  port: parseInt(process.env.PORT || "3000", 10),
  database: {
    url: process.env.DATABASE_URL,
  },
  redis: {
    // Production: Use Upstash Redis URL if provided, otherwise fallback to REDIS_URL
    // Development: Use local Redis URL (REDIS_URL) or Upstash if provided
    url: isProduction
      ? process.env.UPSTASH_REDIS_URL || process.env.REDIS_URL
      : process.env.REDIS_URL || process.env.UPSTASH_REDIS_URL,
    // Local Redis connection details (for development)
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379", 10),
    password: process.env.REDIS_PASSWORD || undefined,
    // Upstash Redis (for production)
    upstashUrl: process.env.UPSTASH_REDIS_URL,
    // Caching disabled by default - set REDIS_ENABLED=true to enable
    // This prevents issues when Redis is not running
    enabled: process.env.REDIS_ENABLED === "true",
  },
  clerk: {
    secretKey: process.env.CLERK_SECRET_KEY,
  },
  logLevel: process.env.LOG_LEVEL || "info",
};

export default config;
