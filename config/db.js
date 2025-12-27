import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import config from './env.js';
import logger from '../utilities/logger.js';
import * as schema from '../db/schema.js';

const { Pool } = pg;

// Create PostgreSQL connection pool
const pool = new Pool({
  connectionString: config.database.url,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000, // Increased to 10 seconds
  // Retry connection on failure
  allowExitOnIdle: false,
});

// Initialize Drizzle ORM with schema
const db = drizzle(pool, { schema });

// Test database connection
pool.on('connect', () => {
  logger.info('Database connection established');
});

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected database error');
});

/**
 * Test database connection
 * Call this on startup to verify database is accessible
 */
export const testConnection = async () => {
  try {
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();
    logger.info('Database connection test successful');
    return true;
  } catch (error) {
    logger.error({ 
      error: error.message,
      databaseUrl: config.database.url?.replace(/:[^:@]+@/, ':****@') // Hide password
    }, 'Database connection test failed');
    return false;
  }
};

export { db, pool, schema };
export default db;

