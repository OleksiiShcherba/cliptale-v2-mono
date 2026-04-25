-- Migration: 029_soft_delete_columns
-- Adds a nullable `deleted_at` column to five tables to enable soft-delete:
--   files, projects, generation_drafts, project_files, draft_files.
--
-- Soft-delete is purely application-level — no hard DELETEs are issued against
-- these rows during normal operation. The FK constraints on the pivot tables
-- (ON DELETE RESTRICT on the file side, ON DELETE CASCADE on the container
-- side) remain unchanged because soft-delete never triggers hard FK cascades.
--
-- Indexes on `files(deleted_at)` and `projects(deleted_at)` are added to make
-- "active rows" filters (`WHERE deleted_at IS NULL`) fast on the two highest-
-- traffic tables. Pivot tables are always joined through their primary-key
-- container_id and therefore do not need a separate index on deleted_at.
--
-- Idempotent: every ALTER TABLE and CREATE INDEX statement is wrapped in an
-- INFORMATION_SCHEMA guard + PREPARE/EXECUTE (pattern from 026_ai_jobs_draft_id).
--
-- Manual rollback:
--   DROP INDEX  idx_projects_deleted_at  ON projects;
--   DROP INDEX  idx_files_deleted_at     ON files;
--   ALTER TABLE draft_files       DROP COLUMN deleted_at;
--   ALTER TABLE project_files     DROP COLUMN deleted_at;
--   ALTER TABLE generation_drafts DROP COLUMN deleted_at;
--   ALTER TABLE projects          DROP COLUMN deleted_at;
--   ALTER TABLE files             DROP COLUMN deleted_at;

-- ── files.deleted_at ─────────────────────────────────────────────────────────
SELECT COUNT(*) INTO @_col_files_deleted_at_exists
  FROM INFORMATION_SCHEMA.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME   = 'files'
   AND COLUMN_NAME  = 'deleted_at';

SET @_sql_files_deleted_at = IF(
  @_col_files_deleted_at_exists = 0,
  'ALTER TABLE files ADD COLUMN deleted_at DATETIME(3) NULL DEFAULT NULL',
  'SELECT 1 /* files.deleted_at already exists */'
);

PREPARE _stmt FROM @_sql_files_deleted_at;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;

-- ── projects.deleted_at ──────────────────────────────────────────────────────
SELECT COUNT(*) INTO @_col_projects_deleted_at_exists
  FROM INFORMATION_SCHEMA.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME   = 'projects'
   AND COLUMN_NAME  = 'deleted_at';

SET @_sql_projects_deleted_at = IF(
  @_col_projects_deleted_at_exists = 0,
  'ALTER TABLE projects ADD COLUMN deleted_at DATETIME(3) NULL DEFAULT NULL',
  'SELECT 2 /* projects.deleted_at already exists */'
);

PREPARE _stmt FROM @_sql_projects_deleted_at;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;

-- ── generation_drafts.deleted_at ─────────────────────────────────────────────
SELECT COUNT(*) INTO @_col_drafts_deleted_at_exists
  FROM INFORMATION_SCHEMA.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME   = 'generation_drafts'
   AND COLUMN_NAME  = 'deleted_at';

SET @_sql_drafts_deleted_at = IF(
  @_col_drafts_deleted_at_exists = 0,
  'ALTER TABLE generation_drafts ADD COLUMN deleted_at DATETIME(3) NULL DEFAULT NULL',
  'SELECT 3 /* generation_drafts.deleted_at already exists */'
);

PREPARE _stmt FROM @_sql_drafts_deleted_at;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;

-- ── project_files.deleted_at ─────────────────────────────────────────────────
SELECT COUNT(*) INTO @_col_pfiles_deleted_at_exists
  FROM INFORMATION_SCHEMA.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME   = 'project_files'
   AND COLUMN_NAME  = 'deleted_at';

SET @_sql_pfiles_deleted_at = IF(
  @_col_pfiles_deleted_at_exists = 0,
  'ALTER TABLE project_files ADD COLUMN deleted_at DATETIME(3) NULL DEFAULT NULL',
  'SELECT 4 /* project_files.deleted_at already exists */'
);

PREPARE _stmt FROM @_sql_pfiles_deleted_at;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;

-- ── draft_files.deleted_at ───────────────────────────────────────────────────
SELECT COUNT(*) INTO @_col_dfiles_deleted_at_exists
  FROM INFORMATION_SCHEMA.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME   = 'draft_files'
   AND COLUMN_NAME  = 'deleted_at';

SET @_sql_dfiles_deleted_at = IF(
  @_col_dfiles_deleted_at_exists = 0,
  'ALTER TABLE draft_files ADD COLUMN deleted_at DATETIME(3) NULL DEFAULT NULL',
  'SELECT 5 /* draft_files.deleted_at already exists */'
);

PREPARE _stmt FROM @_sql_dfiles_deleted_at;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;

-- ── Index: files(deleted_at) ─────────────────────────────────────────────────
SELECT COUNT(*) INTO @_idx_files_deleted_at_exists
  FROM INFORMATION_SCHEMA.STATISTICS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME   = 'files'
   AND INDEX_NAME   = 'idx_files_deleted_at';

SET @_sql_idx_files_deleted_at = IF(
  @_idx_files_deleted_at_exists = 0,
  'CREATE INDEX idx_files_deleted_at ON files (deleted_at)',
  'SELECT 6 /* idx_files_deleted_at already exists */'
);

PREPARE _stmt FROM @_sql_idx_files_deleted_at;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;

-- ── Index: projects(deleted_at) ──────────────────────────────────────────────
SELECT COUNT(*) INTO @_idx_projects_deleted_at_exists
  FROM INFORMATION_SCHEMA.STATISTICS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME   = 'projects'
   AND INDEX_NAME   = 'idx_projects_deleted_at';

SET @_sql_idx_projects_deleted_at = IF(
  @_idx_projects_deleted_at_exists = 0,
  'CREATE INDEX idx_projects_deleted_at ON projects (deleted_at)',
  'SELECT 7 /* idx_projects_deleted_at already exists */'
);

PREPARE _stmt FROM @_sql_idx_projects_deleted_at;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;
