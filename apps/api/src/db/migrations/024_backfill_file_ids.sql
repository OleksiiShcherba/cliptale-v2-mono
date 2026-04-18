-- Migration: 024_backfill_file_ids
-- One-way data migration that completes the Path A transition to `files` as the
-- single source of truth for every user-owned blob.
--
-- Steps (all idempotent via INSERT IGNORE / UPDATE WHERE NULL / INFORMATION_SCHEMA guards):
--   1. Copy every row in `project_assets_current` → `files`, reusing asset_id as file_id.
--   2. Copy every (project_id, asset_id) pair → `project_files` (INSERT IGNORE skips FK violations).
--   3. Set project_clips_current.file_id = asset_id for rows where asset_id IS NOT NULL.
--   4. Set caption_tracks.file_id = asset_id for rows where asset_id IS NOT NULL.
--   5. Set ai_generation_jobs.output_file_id = result_asset_id where not null.
--   6. Set caption_tracks.file_id NOT NULL (safe: asset_id was NOT NULL; all rows mapped).
--   7. Drop FK fk_ai_generation_jobs_asset (references project_assets_current).
--   8. Drop index idx_caption_tracks_asset_project (references dropped column asset_id).
--   9. Drop asset_id from project_clips_current.
--  10. Drop asset_id from caption_tracks.
--  11. Drop result_asset_id from ai_generation_jobs.
--  12. Drop project_assets_current table.
--
-- WARNING: Step 12 is irreversible without a full DB restore. Run against a backup
-- or dev environment first, and verify row counts after each step before merging.
--
-- Idempotency:
--   - Steps 1-5 are gated by an INFORMATION_SCHEMA check on project_assets_current
--     existence; they are skipped entirely on re-run once the table is gone.
--   - INSERT IGNORE prevents duplicate-key errors on re-run (file_id PK).
--   - UPDATE … WHERE file_id IS NULL prevents double-writes on re-run.
--   - INFORMATION_SCHEMA guards prevent re-dropping columns or the table.
--
-- Manual rollback (point-in-time only — requires backup):
--   Restore from backup taken before this migration ran.

-- ── Steps 1-5: Data copy (only when project_assets_current still exists) ─────
-- All five data-copy steps are expressed as prepared statements so they can be
-- conditionally skipped on re-run once project_assets_current has been dropped.

SELECT COUNT(*) INTO @_pac_still_exists
  FROM INFORMATION_SCHEMA.TABLES
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME   = 'project_assets_current';

-- Step 1: Copy project_assets_current → files
-- Reuses asset_id as file_id for a stable 1-to-1 mapping.
-- content_type is mapped to the files.kind ENUM via CASE.
-- duration_ms is left NULL: project_assets_current stores duration_frames (not ms)
-- and lacks fps needed to convert accurately; the ingest worker will re-populate
-- duration_ms when files are re-processed through the new pipeline.
SET @_sql_insert_files = IF(
  @_pac_still_exists > 0,
  'INSERT IGNORE INTO files (
    file_id, user_id, kind, storage_uri, mime_type, bytes, width, height,
    duration_ms, display_name, status, error_message, created_at, updated_at
  )
  SELECT
    asset_id, user_id,
    CASE
      WHEN content_type LIKE ''video/%'' THEN ''video''
      WHEN content_type LIKE ''audio/%'' THEN ''audio''
      WHEN content_type LIKE ''image/%'' THEN ''image''
      ELSE ''other''
    END,
    storage_uri, content_type, file_size_bytes, width, height,
    NULL,
    COALESCE(display_name, filename),
    status, error_message, created_at, updated_at
  FROM project_assets_current',
  'SELECT 1 /* project_assets_current already gone — files already populated */'
);

PREPARE _stmt FROM @_sql_insert_files;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;

-- Step 2: Copy (project_id, asset_id) → project_files
-- INSERT IGNORE silently skips rows where project_id does not exist in projects
-- (e.g. seed data with non-UUID project ids like 'proj-001').
SET @_sql_insert_pfiles = IF(
  @_pac_still_exists > 0,
  'INSERT IGNORE INTO project_files (project_id, file_id, created_at)
   SELECT project_id, asset_id, created_at
   FROM project_assets_current',
  'SELECT 2 /* project_assets_current already gone — project_files already populated */'
);

PREPARE _stmt FROM @_sql_insert_pfiles;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;

-- Step 3: Set project_clips_current.file_id from asset_id
-- Only updates rows where asset_id is not null and file_id is not yet set.
-- Clips may legitimately have NULL asset_id (text-overlay, caption clips).
SELECT COUNT(*) INTO @_col_pcc_asset_id_present
  FROM INFORMATION_SCHEMA.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME   = 'project_clips_current'
   AND COLUMN_NAME  = 'asset_id';

SET @_sql_update_clips = IF(
  @_col_pcc_asset_id_present > 0,
  'UPDATE project_clips_current SET file_id = asset_id WHERE asset_id IS NOT NULL AND file_id IS NULL',
  'SELECT 3 /* project_clips_current.asset_id already dropped */'
);

PREPARE _stmt FROM @_sql_update_clips;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;

-- Step 4: Set caption_tracks.file_id from asset_id
SELECT COUNT(*) INTO @_col_ct_asset_id_present
  FROM INFORMATION_SCHEMA.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME   = 'caption_tracks'
   AND COLUMN_NAME  = 'asset_id';

SET @_sql_update_captions = IF(
  @_col_ct_asset_id_present > 0,
  'UPDATE caption_tracks SET file_id = asset_id WHERE asset_id IS NOT NULL AND file_id IS NULL',
  'SELECT 4 /* caption_tracks.asset_id already dropped */'
);

PREPARE _stmt FROM @_sql_update_captions;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;

-- Step 5: Set ai_generation_jobs.output_file_id from result_asset_id
SELECT COUNT(*) INTO @_col_ajobs_result_asset_present
  FROM INFORMATION_SCHEMA.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME   = 'ai_generation_jobs'
   AND COLUMN_NAME  = 'result_asset_id';

SET @_sql_update_jobs = IF(
  @_col_ajobs_result_asset_present > 0,
  'UPDATE ai_generation_jobs SET output_file_id = result_asset_id WHERE result_asset_id IS NOT NULL AND output_file_id IS NULL',
  'SELECT 5 /* ai_generation_jobs.result_asset_id already dropped */'
);

PREPARE _stmt FROM @_sql_update_jobs;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;

-- ── Step 6: Tighten caption_tracks.file_id to NOT NULL ───────────────────────
-- Safe because caption_tracks.asset_id was NOT NULL in the original schema,
-- so every row now has a populated file_id after step 4. The INFORMATION_SCHEMA
-- guard makes this idempotent (re-run skips if already NOT NULL).
-- Uses COUNT (not COLUMN_DEFAULT) to avoid NULL ambiguity when COLUMN_DEFAULT
-- itself is NULL for a nullable column with no default.
SELECT COUNT(*) INTO @_ct_file_id_is_nullable
  FROM INFORMATION_SCHEMA.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME   = 'caption_tracks'
   AND COLUMN_NAME  = 'file_id'
   AND IS_NULLABLE  = 'YES';

SET @_sql_ct_notnull = IF(
  @_ct_file_id_is_nullable > 0,
  'ALTER TABLE caption_tracks MODIFY COLUMN file_id CHAR(36) NOT NULL',
  'SELECT 6 /* caption_tracks.file_id already NOT NULL */'
);

PREPARE _stmt FROM @_sql_ct_notnull;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;

-- ── Step 7: Drop FK fk_ai_generation_jobs_asset ──────────────────────────────
-- This FK references project_assets_current(asset_id); must be dropped before
-- the table can be dropped in step 12.
SELECT COUNT(*) INTO @_fk_ajobs_asset_exists
  FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
 WHERE CONSTRAINT_SCHEMA = DATABASE()
   AND TABLE_NAME         = 'ai_generation_jobs'
   AND CONSTRAINT_NAME    = 'fk_ai_generation_jobs_asset'
   AND CONSTRAINT_TYPE    = 'FOREIGN KEY';

SET @_sql_drop_fk_ajobs = IF(
  @_fk_ajobs_asset_exists > 0,
  'ALTER TABLE ai_generation_jobs DROP FOREIGN KEY fk_ai_generation_jobs_asset',
  'SELECT 7 /* fk_ai_generation_jobs_asset already dropped */'
);

PREPARE _stmt FROM @_sql_drop_fk_ajobs;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;

-- ── Step 8: Drop index idx_caption_tracks_asset_project ──────────────────────
-- This index references asset_id which will be dropped in step 10.
SELECT COUNT(*) INTO @_idx_ct_asset_exists
  FROM INFORMATION_SCHEMA.STATISTICS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME   = 'caption_tracks'
   AND INDEX_NAME   = 'idx_caption_tracks_asset_project';

SET @_sql_drop_idx_ct = IF(
  @_idx_ct_asset_exists > 0,
  'ALTER TABLE caption_tracks DROP INDEX idx_caption_tracks_asset_project',
  'SELECT 8 /* idx_caption_tracks_asset_project already dropped */'
);

PREPARE _stmt FROM @_sql_drop_idx_ct;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;

-- ── Step 9: Drop project_clips_current.asset_id ───────────────────────────────
SELECT COUNT(*) INTO @_col_pcc_asset_id_exists
  FROM INFORMATION_SCHEMA.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME   = 'project_clips_current'
   AND COLUMN_NAME  = 'asset_id';

SET @_sql_drop_pcc_asset = IF(
  @_col_pcc_asset_id_exists > 0,
  'ALTER TABLE project_clips_current DROP COLUMN asset_id',
  'SELECT 9 /* project_clips_current.asset_id already dropped */'
);

PREPARE _stmt FROM @_sql_drop_pcc_asset;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;

-- ── Step 10: Drop caption_tracks.asset_id ────────────────────────────────────
SELECT COUNT(*) INTO @_col_ct_asset_id_exists
  FROM INFORMATION_SCHEMA.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME   = 'caption_tracks'
   AND COLUMN_NAME  = 'asset_id';

SET @_sql_drop_ct_asset = IF(
  @_col_ct_asset_id_exists > 0,
  'ALTER TABLE caption_tracks DROP COLUMN asset_id',
  'SELECT 10 /* caption_tracks.asset_id already dropped */'
);

PREPARE _stmt FROM @_sql_drop_ct_asset;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;

-- ── Step 11: Drop ai_generation_jobs.result_asset_id ─────────────────────────
SELECT COUNT(*) INTO @_col_ajobs_result_asset_exists
  FROM INFORMATION_SCHEMA.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME   = 'ai_generation_jobs'
   AND COLUMN_NAME  = 'result_asset_id';

SET @_sql_drop_ajobs_result = IF(
  @_col_ajobs_result_asset_exists > 0,
  'ALTER TABLE ai_generation_jobs DROP COLUMN result_asset_id',
  'SELECT 11 /* ai_generation_jobs.result_asset_id already dropped */'
);

PREPARE _stmt FROM @_sql_drop_ajobs_result;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;

-- ── Step 12: Drop project_assets_current table ───────────────────────────────
-- All FKs referencing this table have been dropped in step 7.
-- All data has been copied to `files` and `project_files` in steps 1-2.
-- This step is irreversible.
SELECT COUNT(*) INTO @_tbl_pac_exists
  FROM INFORMATION_SCHEMA.TABLES
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME   = 'project_assets_current';

SET @_sql_drop_pac = IF(
  @_tbl_pac_exists > 0,
  'DROP TABLE project_assets_current',
  'SELECT 12 /* project_assets_current already dropped */'
);

PREPARE _stmt FROM @_sql_drop_pac;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;
