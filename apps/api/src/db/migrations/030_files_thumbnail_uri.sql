-- Migration: 030_files_thumbnail_uri
-- Adds a nullable `thumbnail_uri VARCHAR(1024) NULL` column to the `files`
-- table to store the S3/R2 URI of the thumbnail that media-worker generates
-- during ingest. No index is needed because all lookups on this table go
-- through `file_id` (primary key); thumbnail_uri is read-alongside, not
-- filtered on independently.
--
-- Idempotent: the ALTER TABLE is wrapped in an INFORMATION_SCHEMA guard +
-- PREPARE/EXECUTE (same pattern as 026_ai_jobs_draft_id and 029_soft_delete_columns).
--
-- Manual rollback:
--   ALTER TABLE files DROP COLUMN thumbnail_uri;

-- ── files.thumbnail_uri ───────────────────────────────────────────────────────
SELECT COUNT(*) INTO @_col_files_thumbnail_uri_exists
  FROM INFORMATION_SCHEMA.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME   = 'files'
   AND COLUMN_NAME  = 'thumbnail_uri';

SET @_sql_files_thumbnail_uri = IF(
  @_col_files_thumbnail_uri_exists = 0,
  'ALTER TABLE files ADD COLUMN thumbnail_uri VARCHAR(1024) NULL DEFAULT NULL',
  'SELECT 1 /* files.thumbnail_uri already exists */'
);

PREPARE _stmt FROM @_sql_files_thumbnail_uri;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;
