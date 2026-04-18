-- Migration: 020_projects_owner_title
-- Adds owner_user_id and title columns to the projects table and creates a composite
-- index on (owner_user_id, updated_at DESC) to support efficient per-user project listing
-- sorted by most-recently-updated.
--
-- Backfills pre-existing rows to the dev seed user ('dev-user-001') so that
-- the NOT NULL constraint on owner_user_id is satisfied on existing data.
--
-- Idempotent: uses INFORMATION_SCHEMA guards + PREPARE/EXECUTE to conditionally
-- add columns and the index only when they do not already exist. MySQL 8.0 does
-- not support ADD COLUMN IF NOT EXISTS in plain DDL; the PREPARE/EXECUTE pattern
-- is the correct idempotent mechanism that also works with mysql2 multipleStatements.
--
-- Manual rollback:
--   ALTER TABLE projects
--     DROP INDEX  idx_projects_owner_updated,
--     DROP COLUMN owner_user_id,
--     DROP COLUMN title;

-- ── owner_user_id ─────────────────────────────────────────────────────────────
SELECT COUNT(*) INTO @_col_owner_exists
  FROM INFORMATION_SCHEMA.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME   = 'projects'
   AND COLUMN_NAME  = 'owner_user_id';

SET @_sql_owner = IF(
  @_col_owner_exists = 0,
  'ALTER TABLE projects ADD COLUMN owner_user_id CHAR(36) NOT NULL DEFAULT ''dev-user-001''',
  'SELECT 1 /* owner_user_id already exists */'
);

PREPARE _stmt FROM @_sql_owner;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;

-- ── title ─────────────────────────────────────────────────────────────────────
SELECT COUNT(*) INTO @_col_title_exists
  FROM INFORMATION_SCHEMA.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME   = 'projects'
   AND COLUMN_NAME  = 'title';

SET @_sql_title = IF(
  @_col_title_exists = 0,
  "ALTER TABLE projects ADD COLUMN title VARCHAR(255) NOT NULL DEFAULT 'Untitled project'",
  'SELECT 2 /* title already exists */'
);

PREPARE _stmt FROM @_sql_title;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;

-- ── Backfill ─────────────────────────────────────────────────────────────────
-- Any pre-existing row that still has the column-default owner ('dev-user-001')
-- was created before this migration and belongs to the seed dev user.
-- (Rows created after this migration will have owner_user_id supplied by the application.)
UPDATE projects
   SET owner_user_id = 'dev-user-001'
 WHERE owner_user_id = 'dev-user-001';

-- ── Composite index ───────────────────────────────────────────────────────────
-- Composite index for findProjectsByUserId (ORDER BY updated_at DESC).
-- INFORMATION_SCHEMA guard makes the CREATE INDEX statement idempotent.
SELECT COUNT(*) INTO @_idx_exists
  FROM INFORMATION_SCHEMA.STATISTICS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME   = 'projects'
   AND INDEX_NAME   = 'idx_projects_owner_updated';

SET @_sql_idx = IF(
  @_idx_exists = 0,
  'CREATE INDEX idx_projects_owner_updated ON projects (owner_user_id, updated_at DESC)',
  'SELECT 3 /* idx_projects_owner_updated already exists */'
);

PREPARE _stmt FROM @_sql_idx;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;
