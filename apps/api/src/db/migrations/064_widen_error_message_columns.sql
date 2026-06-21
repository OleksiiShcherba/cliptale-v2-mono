-- Migration: 064_widen_error_message_columns
--
-- Widens `error_message` from VARCHAR(512) to TEXT NULL on every storyboard
-- job/state table that persists provider failure text.
--
-- ROOT CAUSE this fixes: a fal.ai 422 content_policy_violation payload is ~720
-- chars. The worker writes that string into
-- storyboard_reference_blocks.error_message (VARCHAR(512)) on the failure path,
-- which raises MySQL "Data too long for column 'error_message'". That throw
-- happens BEFORE the block reaches a terminal window_status, so the block stays
-- 'running' forever and the reference_image phase never resolves — the
-- storyboard UI hangs on "Generating reference images" indefinitely.
--
-- TEXT (up to 64 KiB) removes the length ceiling for any provider error blob.
-- The change is widening-only and NULL-preserving, so existing rows are
-- untouched (no truncation, no default change).
--
-- Tables touched (all verified to carry error_message VARCHAR(512) at authoring
-- time): storyboard_reference_blocks, storyboard_scene_video_jobs,
-- storyboard_music_generation_jobs, storyboard_scene_illustration_jobs,
-- storyboard_pipeline.
--
-- Idempotent: each ALTER is guarded by an INFORMATION_SCHEMA check on the
-- current COLUMN_TYPE + a PREPARE/EXECUTE block, so re-running the migration
-- (or running it against a DB already on TEXT) is a no-op (pattern from 051 /
-- 056). The guard fires the ALTER only while the column is still varchar(512).
--
-- Manual rollback (lossy if any row already exceeds 512 chars):
--   ALTER TABLE storyboard_reference_blocks       MODIFY error_message VARCHAR(512) NULL;
--   ALTER TABLE storyboard_scene_video_jobs       MODIFY error_message VARCHAR(512) NULL;
--   ALTER TABLE storyboard_music_generation_jobs  MODIFY error_message VARCHAR(512) NULL;
--   ALTER TABLE storyboard_scene_illustration_jobs MODIFY error_message VARCHAR(512) NULL;
--   ALTER TABLE storyboard_pipeline               MODIFY error_message VARCHAR(512) NULL;

-- storyboard_reference_blocks --------------------------------------------------
SELECT COUNT(*) INTO @_w_refblocks
  FROM INFORMATION_SCHEMA.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME   = 'storyboard_reference_blocks'
   AND COLUMN_NAME  = 'error_message'
   AND DATA_TYPE    = 'varchar';

SET @_sql_w_refblocks = IF(
  @_w_refblocks = 1,
  'ALTER TABLE storyboard_reference_blocks MODIFY error_message TEXT NULL',
  'SELECT 1 /* storyboard_reference_blocks.error_message already TEXT */'
);
PREPARE _stmt FROM @_sql_w_refblocks;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;

-- storyboard_scene_video_jobs --------------------------------------------------
SELECT COUNT(*) INTO @_w_videojobs
  FROM INFORMATION_SCHEMA.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME   = 'storyboard_scene_video_jobs'
   AND COLUMN_NAME  = 'error_message'
   AND DATA_TYPE    = 'varchar';

SET @_sql_w_videojobs = IF(
  @_w_videojobs = 1,
  'ALTER TABLE storyboard_scene_video_jobs MODIFY error_message TEXT NULL',
  'SELECT 1 /* storyboard_scene_video_jobs.error_message already TEXT */'
);
PREPARE _stmt FROM @_sql_w_videojobs;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;

-- storyboard_music_generation_jobs ---------------------------------------------
SELECT COUNT(*) INTO @_w_musicjobs
  FROM INFORMATION_SCHEMA.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME   = 'storyboard_music_generation_jobs'
   AND COLUMN_NAME  = 'error_message'
   AND DATA_TYPE    = 'varchar';

SET @_sql_w_musicjobs = IF(
  @_w_musicjobs = 1,
  'ALTER TABLE storyboard_music_generation_jobs MODIFY error_message TEXT NULL',
  'SELECT 1 /* storyboard_music_generation_jobs.error_message already TEXT */'
);
PREPARE _stmt FROM @_sql_w_musicjobs;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;

-- storyboard_scene_illustration_jobs -------------------------------------------
SELECT COUNT(*) INTO @_w_illusjobs
  FROM INFORMATION_SCHEMA.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME   = 'storyboard_scene_illustration_jobs'
   AND COLUMN_NAME  = 'error_message'
   AND DATA_TYPE    = 'varchar';

SET @_sql_w_illusjobs = IF(
  @_w_illusjobs = 1,
  'ALTER TABLE storyboard_scene_illustration_jobs MODIFY error_message TEXT NULL',
  'SELECT 1 /* storyboard_scene_illustration_jobs.error_message already TEXT */'
);
PREPARE _stmt FROM @_sql_w_illusjobs;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;

-- storyboard_pipeline ----------------------------------------------------------
SELECT COUNT(*) INTO @_w_pipeline
  FROM INFORMATION_SCHEMA.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME   = 'storyboard_pipeline'
   AND COLUMN_NAME  = 'error_message'
   AND DATA_TYPE    = 'varchar';

SET @_sql_w_pipeline = IF(
  @_w_pipeline = 1,
  'ALTER TABLE storyboard_pipeline MODIFY error_message TEXT NULL',
  'SELECT 1 /* storyboard_pipeline.error_message already TEXT */'
);
PREPARE _stmt FROM @_sql_w_pipeline;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;
