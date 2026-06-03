-- Adds nullable `flow_id` + `block_id` to the shared `ai_generation_jobs` table so a
-- generation run can be linked back to the flow + the canvas block that triggered it
-- (ADR-0001 / ADR-0007).  Mirrors the existing `draft_id` link (026) EXACTLY:
--   * Both columns are NULLABLE and carry NO foreign key — the job lifecycle is
--     independent of the flow (deleting/soft-deleting a flow does NOT cancel in-flight
--     jobs; an orphaned flow_id is harmless, INSERT IGNORE into flow_files simply
--     produces no row, the correct behaviour — same reasoning as 026 for draft_id).
--   * `block_id` is the canvas-block identity that lives INSIDE the generation_flows.canvas
--     JSON blob (ADR-0002), so it has no table to reference; it lets reattach-on-reopen
--     (AC-08b) map a running job back to its result block.
-- The worker's existing setOutputFile is extended to honor flow_id exactly as draft_id,
-- INSERT-IGNORE-ing into flow_files on successful completion (ADR-0007).
--
-- An index on flow_id serves the reattach read (Flow 2 / AC-08b: read every result
-- block's job state for one flow — WHERE flow_id = ?).
--
-- ALTER on an existing table → guarded with INFORMATION_SCHEMA + PREPARE/EXECUTE (the
-- repo idiom from 026_ai_jobs_draft_id / 029_soft_delete_columns; MySQL 8 has no
-- ADD COLUMN IF NOT EXISTS, and the in-process runner uses mysql2 multipleStatements).
--
-- Idempotent: every statement is guarded; re-running is a no-op.
--
-- Manual rollback: see 03_add_flow_columns_to_ai_generation_jobs.down.sql

-- ── ai_generation_jobs.flow_id ───────────────────────────────────────────────
SELECT COUNT(*) INTO @_col_ajobs_flow_id_exists
  FROM INFORMATION_SCHEMA.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME   = 'ai_generation_jobs'
   AND COLUMN_NAME  = 'flow_id';

SET @_sql_add_flow_id = IF(
  @_col_ajobs_flow_id_exists = 0,
  'ALTER TABLE ai_generation_jobs ADD COLUMN flow_id CHAR(36) NULL AFTER draft_id',
  'SELECT 1 /* ai_generation_jobs.flow_id already exists */'
);

PREPARE _stmt FROM @_sql_add_flow_id;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;

-- ── ai_generation_jobs.block_id ──────────────────────────────────────────────
SELECT COUNT(*) INTO @_col_ajobs_block_id_exists
  FROM INFORMATION_SCHEMA.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME   = 'ai_generation_jobs'
   AND COLUMN_NAME  = 'block_id';

SET @_sql_add_block_id = IF(
  @_col_ajobs_block_id_exists = 0,
  'ALTER TABLE ai_generation_jobs ADD COLUMN block_id CHAR(36) NULL AFTER flow_id',
  'SELECT 2 /* ai_generation_jobs.block_id already exists */'
);

PREPARE _stmt FROM @_sql_add_block_id;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;

-- ── Index: ai_generation_jobs(flow_id) ───────────────────────────────────────
SELECT COUNT(*) INTO @_idx_ajobs_flow_id_exists
  FROM INFORMATION_SCHEMA.STATISTICS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME   = 'ai_generation_jobs'
   AND INDEX_NAME   = 'idx_ai_generation_jobs_flow_id';

SET @_sql_add_idx_flow_id = IF(
  @_idx_ajobs_flow_id_exists = 0,
  'CREATE INDEX idx_ai_generation_jobs_flow_id ON ai_generation_jobs (flow_id)',
  'SELECT 3 /* idx_ai_generation_jobs_flow_id already exists */'
);

PREPARE _stmt FROM @_sql_add_idx_flow_id;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;
