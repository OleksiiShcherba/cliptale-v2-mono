-- Migration: 020_projects_owner_title
-- Adds owner_user_id and title columns to the projects table and creates a composite
-- index on (owner_user_id, updated_at DESC) to support efficient per-user project listing
-- sorted by most-recently-updated.
--
-- Backfills pre-existing rows to the dev seed user ('dev-user-001') so that
-- the NOT NULL constraint on owner_user_id is satisfied on existing data.
--
-- Idempotent: uses ADD COLUMN IF NOT EXISTS (MySQL 8.0.29+). Safe to re-run.
--
-- Manual rollback:
--   ALTER TABLE projects
--     DROP INDEX  idx_projects_owner_updated,
--     DROP COLUMN owner_user_id,
--     DROP COLUMN title;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS owner_user_id CHAR(36)      NOT NULL DEFAULT 'dev-user-001',
  ADD COLUMN IF NOT EXISTS title         VARCHAR(255)  NOT NULL DEFAULT 'Untitled project';

-- Backfill: any pre-existing row that still has the column-default owner ('dev-user-001')
-- was created before this migration and belongs to the seed dev user.
-- (Rows created after this migration will have owner_user_id supplied by the application.)
UPDATE projects
   SET owner_user_id = 'dev-user-001'
 WHERE owner_user_id = 'dev-user-001';

-- Composite index for findProjectsByUserId (ORDER BY updated_at DESC).
-- IF NOT EXISTS guard makes the statement idempotent on MySQL 8.0.29+.
CREATE INDEX IF NOT EXISTS idx_projects_owner_updated
  ON projects (owner_user_id, updated_at DESC);
