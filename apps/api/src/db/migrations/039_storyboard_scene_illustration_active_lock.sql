-- Migration: 039_storyboard_scene_illustration_active_lock
-- Adds a nullable active-lock column and unique key so only one queued,
-- running, or ready illustration attempt can exist per storyboard scene block.
--
-- Failed attempts and older active duplicates are normalized to NULL before
-- the unique index is created. This keeps the migration safe for environments
-- that already ran migration 038 and accumulated multiple attempts.
--
-- Idempotent: INFORMATION_SCHEMA guards + PREPARE/EXECUTE.
--
-- Manual rollback:
--   ALTER TABLE storyboard_scene_illustration_jobs
--     DROP INDEX uq_storyboard_scene_illustration_active_block,
--     DROP COLUMN active_lock;

SELECT COUNT(*) INTO @_col_active_lock_exists
  FROM INFORMATION_SCHEMA.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME   = 'storyboard_scene_illustration_jobs'
   AND COLUMN_NAME  = 'active_lock';

SET @_sql_active_lock = IF(
  @_col_active_lock_exists = 0,
  'ALTER TABLE storyboard_scene_illustration_jobs
     ADD COLUMN active_lock TINYINT(1) NULL DEFAULT 1',
  'SELECT 1 /* active_lock already exists */'
);

PREPARE _stmt FROM @_sql_active_lock;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;

UPDATE storyboard_scene_illustration_jobs sj
LEFT JOIN (
  SELECT latest_active.id
    FROM (
      SELECT sj1.id
        FROM storyboard_scene_illustration_jobs sj1
        LEFT JOIN storyboard_scene_illustration_jobs newer
          ON newer.draft_id = sj1.draft_id
         AND newer.block_id = sj1.block_id
         AND newer.status IN ('queued', 'running', 'ready')
         AND (
           newer.created_at > sj1.created_at
           OR (newer.created_at = sj1.created_at AND newer.id > sj1.id)
         )
       WHERE sj1.status IN ('queued', 'running', 'ready')
         AND newer.id IS NULL
    ) latest_active
) keep_active
  ON keep_active.id = sj.id
   SET sj.active_lock = CASE
     WHEN sj.status IN ('queued', 'running', 'ready') AND keep_active.id IS NOT NULL THEN 1
     ELSE NULL
   END;

SELECT COUNT(*) INTO @_idx_active_block_exists
  FROM INFORMATION_SCHEMA.STATISTICS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME   = 'storyboard_scene_illustration_jobs'
   AND INDEX_NAME   = 'uq_storyboard_scene_illustration_active_block';

SET @_sql_active_block_idx = IF(
  @_idx_active_block_exists = 0,
  'CREATE UNIQUE INDEX uq_storyboard_scene_illustration_active_block
     ON storyboard_scene_illustration_jobs (draft_id, block_id, active_lock)',
  'SELECT 2 /* uq_storyboard_scene_illustration_active_block already exists */'
);

PREPARE _stmt FROM @_sql_active_block_idx;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;
