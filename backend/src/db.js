import './config.js';
import pg from 'pg';

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;
let configurationError = null;
let pool;

if (!databaseUrl) {
  configurationError = 'DATABASE_URL is not configured. Copy .env.example to backend/.env and enter your PostgreSQL connection string.';
} else {
  try {
    const parsed = new URL(databaseUrl);
    if (!parsed.password) {
      configurationError = 'DATABASE_URL has no password. Add it after the username, for example: postgresql://postgres:YOUR_PASSWORD@localhost:5432/college_events';
    } else {
      pool = new Pool({ connectionString: databaseUrl, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false });
    }
  } catch {
    configurationError = 'DATABASE_URL is not a valid PostgreSQL connection string.';
  }
}

export function getPool() {
  if (!pool) {
    const error = new Error(configurationError || 'Database is not configured.');
    error.statusCode = 503;
    throw error;
  }
  return pool;
}

export async function databaseStatus() {
  if (!pool) return 'not configured';
  try {
    await pool.query('SELECT 1');
    return 'connected';
  } catch {
    return 'unavailable';
  }
}
