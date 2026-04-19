-- Migration: 000_schema_migrations
-- Creates the bookkeeping table used by the in-process migration runner.
-- Applied by the runner itself on first boot before any other migration.
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename    VARCHAR(255) PRIMARY KEY,
  checksum    CHAR(64)     NOT NULL,
  applied_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
);
