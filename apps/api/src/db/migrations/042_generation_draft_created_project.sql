-- Migration: 042_generation_draft_created_project
-- Adds durable Step 3 completion pointers for storyboard draft project assembly.
--
-- Nullable columns keep failed/retryable drafts unblocked. Once assembly commits,
-- services can return the existing project/version ids for idempotent retries.
--
-- Idempotent: INFORMATION_SCHEMA guards + PREPARE/EXECUTE.

SELECT COUNT(*) INTO @_col_generation_drafts_created_project_id_exists
  FROM INFORMATION_SCHEMA.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME   = 'generation_drafts'
   AND COLUMN_NAME  = 'created_project_id';

SET @_sql_generation_drafts_created_project_id = IF(
  @_col_generation_drafts_created_project_id_exists = 0,
  'ALTER TABLE generation_drafts
     ADD COLUMN created_project_id CHAR(36) NULL
     AFTER deleted_at',
  'SELECT 1 /* created_project_id already exists */'
);

PREPARE _stmt FROM @_sql_generation_drafts_created_project_id;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;

SELECT COUNT(*) INTO @_col_generation_drafts_created_project_version_id_exists
  FROM INFORMATION_SCHEMA.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME   = 'generation_drafts'
   AND COLUMN_NAME  = 'created_project_version_id';

SET @_sql_generation_drafts_created_project_version_id = IF(
  @_col_generation_drafts_created_project_version_id_exists = 0,
  'ALTER TABLE generation_drafts
     ADD COLUMN created_project_version_id BIGINT UNSIGNED NULL
     AFTER created_project_id',
  'SELECT 1 /* created_project_version_id already exists */'
);

PREPARE _stmt FROM @_sql_generation_drafts_created_project_version_id;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;

SELECT COUNT(*) INTO @_idx_generation_drafts_created_project_exists
  FROM INFORMATION_SCHEMA.STATISTICS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME   = 'generation_drafts'
   AND INDEX_NAME   = 'idx_generation_drafts_created_project';

SET @_sql_generation_drafts_created_project_idx = IF(
  @_idx_generation_drafts_created_project_exists = 0,
  'ALTER TABLE generation_drafts
     ADD INDEX idx_generation_drafts_created_project (created_project_id)',
  'SELECT 1 /* idx_generation_drafts_created_project already exists */'
);

PREPARE _stmt FROM @_sql_generation_drafts_created_project_idx;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;

