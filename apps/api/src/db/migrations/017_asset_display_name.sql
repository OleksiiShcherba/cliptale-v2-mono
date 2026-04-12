-- Migration: 017_asset_display_name
-- Adds a nullable display_name column to project_assets_current so users can
-- give assets human-readable names without altering the underlying storage key
-- (filename). The UI shows displayName ?? filename; the filename column is never
-- changed by a rename operation.
--
-- Note: MySQL does not support ADD COLUMN IF NOT EXISTS in plain DDL without a
-- stored procedure + DELIMITER block. mysql2's multipleStatements mode cannot
-- parse DELIMITER-bracketed procedure bodies (see migration 014 for context).
-- This migration is therefore NOT idempotent — run it exactly once. If re-run
-- after the column already exists, MySQL will return an error which the
-- migration runner must handle (e.g. treat "Duplicate column name" as a no-op).
--
-- DOWN (rollback — apply manually):
-- ALTER TABLE project_assets_current DROP COLUMN display_name;

ALTER TABLE project_assets_current
  ADD COLUMN display_name VARCHAR(255) NULL DEFAULT NULL AFTER filename;
