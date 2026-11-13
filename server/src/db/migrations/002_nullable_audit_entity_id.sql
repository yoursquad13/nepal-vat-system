-- Migration: 002_nullable_audit_entity_id.sql
-- Allow entity_id to be NULL in activity_logs for system-level actions (e.g., BACKUP, SETTINGS)

ALTER TABLE activity_logs ALTER COLUMN entity_id DROP NOT NULL;
