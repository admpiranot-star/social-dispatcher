import { Pool, PoolClient } from 'pg';
import { config } from '../config';
import { logger } from '../lib/logger';

const pool = new Pool({
  connectionString: config.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

/** Shared pool access for modules that need raw pool (e.g., memory manager) */
export function getPool(): Pool {
  return pool;
}

pool.on('error', (err) => {
  logger.error({ err }, 'Database pool error');
});

export async function query(sql: string, params?: any[]): Promise<any> {
  const client = await pool.connect();
  try {
    return await client.query(sql, params);
  } finally {
    client.release();
  }
}

export async function queryOne(sql: string, params?: any[]): Promise<any> {
  const result = await query(sql, params);
  return result.rows[0];
}

export async function executeTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function health(): Promise<boolean> {
  try {
    const result = await query('SELECT NOW()');
    return !!result.rows[0];
  } catch {
    return false;
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
}
