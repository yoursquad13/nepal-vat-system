import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { env } from '../config/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function runMigrations(databaseUrl?: string): Promise<void> {
  const targetUrl = databaseUrl || env.DATABASE_URL;
  const pool = new pg.Pool({ connectionString: targetUrl });

  const client = await pool.connect();
  try {
    // 1. Ensure migrations table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        version TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 2. Read all .sql files in migrations directory
    const migrationsDir = path.resolve(__dirname, 'migrations');
    const files = (await fs.readdir(migrationsDir))
      .filter((f) => f.endsWith('.sql'))
      .sort();

    // 3. Check already applied migrations
    const res = await client.query('SELECT version FROM schema_migrations');
    const applied = new Set(res.rows.map((r: { version: string }) => r.version));

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`[migrate] Already applied: ${file}`);
        continue;
      }

      console.log(`[migrate] Applying: ${file}...`);
      const filePath = path.join(migrationsDir, file);
      const sql = await fs.readFile(filePath, 'utf-8');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`[migrate] Successfully applied: ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[migrate] Failed applying ${file}:`, err);
        throw err;
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

// Allow CLI invocation
const isMain = process.argv[1] && (
  process.argv[1].endsWith('migrate.ts') ||
  process.argv[1].endsWith('migrate.js') ||
  process.argv[1].includes('migrate')
);

if (isMain) {
  runMigrations()
    .then(() => {
      console.log('[migrate] All migrations applied successfully.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[migrate] Migration failed:', err);
      process.exit(1);
    });
}
