import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Drizzle Kit Configuration
 * Used for generating migrations and managing database schema
 */
export default {
  schema: './db/schema.js',
  out: './db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL
  }
};

