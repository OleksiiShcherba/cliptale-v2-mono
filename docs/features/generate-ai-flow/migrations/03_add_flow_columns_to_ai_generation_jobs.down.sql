-- Rollback for 03_add_flow_columns_to_ai_generation_jobs.up.sql
-- Drops the index first, then both columns.  Guarded so re-running is a no-op.

-- ── Drop index idx_ai_generation_jobs_flow_id ────────────────────────────────
SELECT COUNT(*) INTO @_idx_ajobs_flow_id_exists
  FROM INFORMATION_SCHEMA.STATISTICS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME   = 'ai_generation_jobs'
   AND INDEX_NAME   = 'idx_ai_generation_jobs_flow_id';

SET @_sql_drop_idx_flow_id = IF(
  @_idx_ajobs_flow_id_exists > 0,
  'ALTER TABLE ai_generation_jobs DROP INDEX idx_ai_generation_jobs_flow_id',
  'SELECT 1 /* idx_ai_generation_jobs_flow_id already dropped */'
);

PREPARE _stmt FROM @_sql_drop_idx_flow_id;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;

-- ── Drop column block_id ──────────────────────────────────────────────────────
SELECT COUNT(*) INTO @_col_ajobs_block_id_exists
  FROM INFORMATION_SCHEMA.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME   = 'ai_generation_jobs'
   AND COLUMN_NAME  = 'block_id';

SET @_sql_drop_block_id = IF(
  @_col_ajobs_block_id_exists > 0,
  'ALTER TABLE ai_generation_jobs DROP COLUMN block_id',
  'SELECT 2 /* ai_generation_jobs.block_id already dropped */'
);

PREPARE _stmt FROM @_sql_drop_block_id;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;

-- ── Drop column flow_id ───────────────────────────────────────────────────────
SELECT COUNT(*) INTO @_col_ajobs_flow_id_exists
  FROM INFORMATION_SCHEMA.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME   = 'ai_generation_jobs'
   AND COLUMN_NAME  = 'flow_id';

SET @_sql_drop_flow_id = IF(
  @_col_ajobs_flow_id_exists > 0,
  'ALTER TABLE ai_generation_jobs DROP COLUMN flow_id',
  'SELECT 3 /* ai_generation_jobs.flow_id already dropped */'
);

PREPARE _stmt FROM @_sql_drop_flow_id;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;
