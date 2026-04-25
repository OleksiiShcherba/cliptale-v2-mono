-- Migration: 025_drop_ai_job_project_id
-- Removes the project_id column from ai_generation_jobs.
-- After this migration, AI jobs are tied only to user_id + output_file_id;
-- they are no longer scoped to a project. This matches the product rule:
-- "AI-job in DB must be tied to the file/user-asset, nothing else."
--
-- Steps (all idempotent via INFORMATION_SCHEMA guards + PREPARE/EXECUTE):
--   1. Drop FK fk_ai_generation_jobs_project (references projects.project_id).
--   2. Drop index idx_ai_generation_jobs_project_id.
--   3. Drop column project_id from ai_generation_jobs.
--
-- Manual rollback:
--   ALTER TABLE ai_generation_jobs
--     ADD COLUMN project_id CHAR(36) NOT NULL DEFAULT 'unknown',
--     ADD INDEX idx_ai_generation_jobs_project_id (project_id),
--     ADD CONSTRAINT fk_ai_generation_jobs_project
--       FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE CASCADE;

-- ── Step 1: Drop FK fk_ai_generation_jobs_project ────────────────────────────
SELECT COUNT(*) INTO @_fk_ajobs_project_exists
  FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
 WHERE CONSTRAINT_SCHEMA = DATABASE()
   AND TABLE_NAME         = 'ai_generation_jobs'
   AND CONSTRAINT_NAME    = 'fk_ai_generation_jobs_project'
   AND CONSTRAINT_TYPE    = 'FOREIGN KEY';

SET @_sql_drop_fk_project = IF(
  @_fk_ajobs_project_exists > 0,
  'ALTER TABLE ai_generation_jobs DROP FOREIGN KEY fk_ai_generation_jobs_project',
  'SELECT 1 /* fk_ai_generation_jobs_project already dropped */'
);

PREPARE _stmt FROM @_sql_drop_fk_project;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;

-- ── Step 2: Drop index idx_ai_generation_jobs_project_id ─────────────────────
SELECT COUNT(*) INTO @_idx_ajobs_project_exists
  FROM INFORMATION_SCHEMA.STATISTICS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME   = 'ai_generation_jobs'
   AND INDEX_NAME   = 'idx_ai_generation_jobs_project_id';

SET @_sql_drop_idx_project = IF(
  @_idx_ajobs_project_exists > 0,
  'ALTER TABLE ai_generation_jobs DROP INDEX idx_ai_generation_jobs_project_id',
  'SELECT 2 /* idx_ai_generation_jobs_project_id already dropped */'
);

PREPARE _stmt FROM @_sql_drop_idx_project;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;

-- ── Step 3: Drop column project_id ───────────────────────────────────────────
SELECT COUNT(*) INTO @_col_ajobs_project_exists
  FROM INFORMATION_SCHEMA.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME   = 'ai_generation_jobs'
   AND COLUMN_NAME  = 'project_id';

SET @_sql_drop_project_col = IF(
  @_col_ajobs_project_exists > 0,
  'ALTER TABLE ai_generation_jobs DROP COLUMN project_id',
  'SELECT 3 /* ai_generation_jobs.project_id already dropped */'
);

PREPARE _stmt FROM @_sql_drop_project_col;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;
