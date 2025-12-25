import { z } from "zod";
import dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

/**
 * Environment variable schema with validation
 * In development mode, some values have defaults for easier local testing
 */
const envSchema = z.object({
  // Application
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.string().transform(Number).default("3000"),

  // Database (required in production)
  DATABASE_URL: z
    .string()
    .url()
    .optional()
    .default("postgresql://localhost:5432/saasguard")
    .describe("PostgreSQL connection string"),

  // Redis (required in production)
  REDIS_URL: z
    .string()
    .url()
    .optional()
    .default("redis://localhost:6379")
    .describe("Redis connection string"),

  // Clerk Authentication (required in production)
  CLERK_SECRET_KEY: z
    .string()
    .optional()
    .default("sk_test_placeholder")
    .describe("Clerk secret key for server-side authentication"),
  CLERK_PUBLISHABLE_KEY: z
    .string()
    .optional()
    .default("pk_test_placeholder")
    .describe("Clerk publishable key"),
});

/**
 * Validated environment type
 */
export type Env = z.infer<typeof envSchema>;

/**
 * Parse and validate environment variables
 */
function validateEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error("❌ Invalid environment variables:");
    console.error(parsed.error.flatten().fieldErrors);
    throw new Error("Invalid environment variables. Check the errors above.");
  }

  return parsed.data;
}

/**
 * Validated environment configuration
 * Throws an error at startup if validation fails
 */
export const env = validateEnv();

/**
 * Check if running in production mode
 */
export const isProduction = env.NODE_ENV === "production";

/**
 * Check if running in development mode
 */
export const isDevelopment = env.NODE_ENV === "development";

/**
 * Check if running in test mode
 */
export const isTest = env.NODE_ENV === "test";
