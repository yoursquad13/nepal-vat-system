import pg from 'pg';
import { env } from './env.js';

// Force node-pg to return DATE columns (OID 1082) as raw 'YYYY-MM-DD' strings
// to avoid local/UTC timezone day-shifting.
pg.types.setTypeParser(1082, (val: string) => val);

const connectionString =
  process.env.NODE_ENV === 'test' && (process.env.TEST_DATABASE_URL || env.TEST_DATABASE_URL)
    ? (process.env.TEST_DATABASE_URL || env.TEST_DATABASE_URL)
    : env.DATABASE_URL;

export const pool = new pg.Pool({
  connectionString,
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
