import pg from 'pg';
import { env } from './env.js';

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client', err);
});

export async function query<T extends pg.QueryResultRow = any>(
  sql: string,
  params?: any[]
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(sql, params);
}

export async function withTransaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
