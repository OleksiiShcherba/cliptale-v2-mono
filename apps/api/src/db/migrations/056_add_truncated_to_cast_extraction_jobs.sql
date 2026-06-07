-- Migration: 056_add_truncated_to_cast_extraction_jobs
--
-- Adds the overflow/truncation marker to the cast-extract job (F4, AC-02). The
-- worker trims the proposal to the cast size limit (12) and computes `overflow`,
-- but had nowhere to persist it, so the Creator was never told entries were
-- trimmed. This column is the end-to-end carrier: worker → DB → controller
-- (surfaced as `truncated` per contracts/openapi.yaml CastExtractionJob.truncated)
-- → CastConfirmModal overflow notice.
--
-- DEFAULT 0 instantly backfills existing rows as not-truncated (INSTANT ALTER,
-- metadata only).
--
-- Idempotent: the ALTER is wrapped in an INFORMATION_SCHEMA guard + PREPARE/
-- EXECUTE (pattern from 051).
--
-- Manual rollback:
--   ALTER TABLE storyboard_cast_extraction_jobs DROP COLUMN truncated;

SELECT COUNT(*) INTO @_col_cast_truncated_exists
  FROM INFORMATION_SCHEMA.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME   = 'storyboard_cast_extraction_jobs'
   AND COLUMN_NAME  = 'truncated';

SET @_sql_cast_truncated = IF(
  @_col_cast_truncated_exists = 0,
  'ALTER TABLE storyboard_cast_extraction_jobs ADD COLUMN truncated TINYINT(1) NOT NULL DEFAULT 0 AFTER proposal_json',
  'SELECT 1 /* storyboard_cast_extraction_jobs.truncated already exists */'
);

PREPARE _stmt FROM @_sql_cast_truncated;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;
