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
  connectionTimeoutMillis: 2000,
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

export { db, pool, schema };
export default db;

