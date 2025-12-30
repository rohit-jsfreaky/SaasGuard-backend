import dotenv from 'dotenv';
import { defineConfig } from 'drizzle-kit';

dotenv.config();

export default defineConfig({
  schema: './db/schema.js',
  out: './db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false,
    },
  },
});
