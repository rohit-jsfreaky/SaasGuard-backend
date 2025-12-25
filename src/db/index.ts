import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { env } from "../config/environment.js";
import * as schema from "./schema.js";

const { Pool } = pg;

/**
 * PostgreSQL connection pool
 */
const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20, // Maximum number of connections
  idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
  connectionTimeoutMillis: 10000, // Timeout for establishing a connection
});

// Handle pool errors
pool.on("error", (err) => {
  console.error("Unexpected PostgreSQL pool error:", err);
});

/**
 * Drizzle ORM database client
 * Includes all schema definitions for type-safe queries
 */
export const db = drizzle(pool, { schema });

/**
 * Export the pool for direct access if needed
 */
export { pool };

/**
 * Test the database connection
 */
export async function testConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
    await client.query("SELECT 1");
    client.release();
    console.log("✅ Database connection successful");
    return true;
  } catch (error) {
    console.error("❌ Database connection failed:", error);
    return false;
  }
}

/**
 * Gracefully close all database connections
 */
export async function closeConnection(): Promise<void> {
  await pool.end();
  console.log("Database connections closed");
}
