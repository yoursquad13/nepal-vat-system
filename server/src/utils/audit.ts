import pg from 'pg';
import { pool } from '../config/db.js';

export type EntityType =
  | 'PURCHASE'
  | 'VAT_BILL'
  | 'PAYMENT'
  | 'VENDOR'
  | 'PRODUCT'
  | 'INVENTORY'
  | 'USER'
  | 'SETTINGS'
  | 'BACKUP';

export interface AuditLogEntry {
  entityType: EntityType;
  entityId?: number | string | null;
  action: string;
  summary: string;
  oldValues?: any;
  newValues?: any;
  performedBy?: number | string | null;
  performedByName?: string | null;
}

/**
 * Record an entry into activity_logs table
 * Accepts either (dbClient, entry) or (entry) defaulting to main pool.
 */
export async function logActivity(
  clientOrEntry: pg.PoolClient | pg.Pool | AuditLogEntry,
  maybeEntry?: AuditLogEntry
): Promise<void> {
  let db: pg.PoolClient | pg.Pool;
  let entry: AuditLogEntry;

  if (maybeEntry) {
    db = clientOrEntry as pg.PoolClient | pg.Pool;
    entry = maybeEntry;
  } else {
    db = pool;
    entry = clientOrEntry as AuditLogEntry;
  }

  await db.query(
    `INSERT INTO activity_logs (
      entity_type, entity_id, action, summary, old_values, new_values, performed_by, performed_by_name
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      entry.entityType,
      entry.entityId != null ? entry.entityId : null,
      entry.action,
      entry.summary,
      entry.oldValues != null ? JSON.stringify(entry.oldValues) : null,
      entry.newValues != null ? JSON.stringify(entry.newValues) : null,
      entry.performedBy != null ? entry.performedBy : null,
      entry.performedByName ?? null,
    ]
  );
}
