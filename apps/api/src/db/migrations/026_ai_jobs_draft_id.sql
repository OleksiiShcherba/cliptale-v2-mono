-- Migration: 026_ai_jobs_draft_id
-- Adds a nullable `draft_id` column to `ai_generation_jobs`.
--
-- When an AI generation request originates from a generation draft (via
-- POST /generation-drafts/:draftId/ai/generate), the service records the
-- association by setting this column immediately after enqueue. The repository's
-- setOutputFile function reads draft_id to auto-link the output file to
-- draft_files upon job completion, closing the loop without requiring the
-- media worker to know about drafts.
--
-- The column is nullable (no FK): the job lifecycle is independent of the
-- draft — deleting a draft does NOT cancel in-flight jobs, and the orphaned
-- draft_id is harmless (INSERT IGNORE into draft_files will simply miss the
-- now-absent draft FK and produce no row, which is the correct behaviour).
--
-- Idempotent: guarded by INFORMATION_SCHEMA check + PREPARE/EXECUTE.
--
-- Manual rollback:
--   ALTER TABLE ai_generation_jobs DROP COLUMN draft_id;

SELECT COUNT(*) INTO @_col_ajobs_draft_id_exists
  FROM INFORMATION_SCHEMA.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME   = 'ai_generation_jobs'
   AND COLUMN_NAME  = 'draft_id';

SET @_sql_add_draft_id = IF(
  @_col_ajobs_draft_id_exists = 0,
  'ALTER TABLE ai_generation_jobs ADD COLUMN draft_id CHAR(36) NULL AFTER output_file_id',
  'SELECT 1 /* ai_generation_jobs.draft_id already exists */'
);

PREPARE _stmt FROM @_sql_add_draft_id;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;
