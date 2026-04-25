-- Migration: 023_downstream_file_id_columns
-- Adds nullable `file_id` columns to the downstream tables that currently
-- reference `project_assets_current` via `asset_id`. Also adds `output_file_id`
-- to `ai_generation_jobs` to replace the legacy `result_asset_id` reference.
--
-- All additions are idempotent via INFORMATION_SCHEMA guards + PREPARE/EXECUTE.
-- MySQL 8.0 does not support ADD COLUMN IF NOT EXISTS in plain DDL.
--
-- Columns are added as NULL initially so that the backfill in migration 024
-- can populate them before the NOT NULL constraint is applied (where appropriate).
--
-- Manual rollback:
--   ALTER TABLE project_clips_current  DROP COLUMN file_id;
--   ALTER TABLE caption_tracks         DROP COLUMN file_id;
--   ALTER TABLE ai_generation_jobs     DROP COLUMN file_id;
--   ALTER TABLE ai_generation_jobs     DROP COLUMN output_file_id;

-- ── project_clips_current.file_id ────────────────────────────────────────────
SELECT COUNT(*) INTO @_col_pcc_file_id_exists
  FROM INFORMATION_SCHEMA.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME   = 'project_clips_current'
   AND COLUMN_NAME  = 'file_id';

SET @_sql_pcc_file_id = IF(
  @_col_pcc_file_id_exists = 0,
  'ALTER TABLE project_clips_current ADD COLUMN file_id CHAR(36) NULL AFTER asset_id',
  'SELECT 1 /* project_clips_current.file_id already exists */'
);

PREPARE _stmt FROM @_sql_pcc_file_id;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;

-- ── caption_tracks.file_id ───────────────────────────────────────────────────
SELECT COUNT(*) INTO @_col_ct_file_id_exists
  FROM INFORMATION_SCHEMA.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME   = 'caption_tracks'
   AND COLUMN_NAME  = 'file_id';

SET @_sql_ct_file_id = IF(
  @_col_ct_file_id_exists = 0,
  'ALTER TABLE caption_tracks ADD COLUMN file_id CHAR(36) NULL AFTER asset_id',
  'SELECT 2 /* caption_tracks.file_id already exists */'
);

PREPARE _stmt FROM @_sql_ct_file_id;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;

-- ── ai_generation_jobs.file_id ───────────────────────────────────────────────
-- Transitional column: mirrors `result_asset_id` semantics while 024 backfills.
-- Renamed to output_file_id in the same migration cycle; this column is used
-- during the backfill window only and dropped in 024 after output_file_id is set.
-- We use `output_file_id` directly (no intermediate `file_id`) to avoid churn.
SELECT COUNT(*) INTO @_col_ajobs_output_file_id_exists
  FROM INFORMATION_SCHEMA.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME   = 'ai_generation_jobs'
   AND COLUMN_NAME  = 'output_file_id';

SET @_sql_ajobs_output = IF(
  @_col_ajobs_output_file_id_exists = 0,
  'ALTER TABLE ai_generation_jobs ADD COLUMN output_file_id CHAR(36) NULL AFTER result_asset_id',
  'SELECT 3 /* ai_generation_jobs.output_file_id already exists */'
);

PREPARE _stmt FROM @_sql_ajobs_output;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;
