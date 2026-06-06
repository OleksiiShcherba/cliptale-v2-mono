-- Migration: 051_add_history_origin_preview
-- (promoted from docs/features/storyboard-autosave-checkpoints/migrations/02_add_history_origin_preview.up.sql)
--
-- Extends `storyboard_history` with the checkpoint marker (ADR-0003):
--   - origin       ENUM('legacy','checkpoint') NOT NULL DEFAULT 'legacy'
--                  DEFAULT 'legacy' instantly "backfills" all existing rows as legacy
--                  (INSTANT ALTER — metadata only, no table rebuild, no downtime);
--                  new checkpoint inserts set 'checkpoint' explicitly.
--   - preview_kind ENUM('screenshot','minimap') NULL DEFAULT NULL
--                  NULL = legacy row (the concept does not apply); feeds the cheap
--                  server-side fallback-share count (NFR < 2%) without parsing the
--                  snapshot JSON.
--   - idx_storyboard_history_draft_origin (draft_id, origin, id DESC)
--                  serves the History-panel list (AC-08):
--                  WHERE draft_id = ? AND origin = 'checkpoint' ORDER BY id DESC LIMIT 50.
--                  Built INPLACE (online) — the table stays readable/writable.
--
-- The prune logic stays origin-agnostic: legacy rows age out via the existing
-- 50-cap (spec non-goal: no legacy cleanup). The fallback-share count
-- (WHERE origin='checkpoint' GROUP BY preview_kind) is a rare analytic query —
-- deliberately NOT indexed.
--
-- Idempotent: every ALTER/CREATE INDEX is wrapped in an INFORMATION_SCHEMA guard
-- + PREPARE/EXECUTE (pattern from 026/029).
--
-- Manual rollback:
--   DROP INDEX  idx_storyboard_history_draft_origin ON storyboard_history;
--   ALTER TABLE storyboard_history DROP COLUMN preview_kind;
--   ALTER TABLE storyboard_history DROP COLUMN origin;

-- ── storyboard_history.origin ────────────────────────────────────────────────
SELECT COUNT(*) INTO @_col_history_origin_exists
  FROM INFORMATION_SCHEMA.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME   = 'storyboard_history'
   AND COLUMN_NAME  = 'origin';

SET @_sql_history_origin = IF(
  @_col_history_origin_exists = 0,
  'ALTER TABLE storyboard_history ADD COLUMN origin ENUM(''legacy'',''checkpoint'') NOT NULL DEFAULT ''legacy'' AFTER snapshot',
  'SELECT 1 /* storyboard_history.origin already exists */'
);

PREPARE _stmt FROM @_sql_history_origin;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;

-- ── storyboard_history.preview_kind ──────────────────────────────────────────
SELECT COUNT(*) INTO @_col_history_preview_kind_exists
  FROM INFORMATION_SCHEMA.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME   = 'storyboard_history'
   AND COLUMN_NAME  = 'preview_kind';

SET @_sql_history_preview_kind = IF(
  @_col_history_preview_kind_exists = 0,
  'ALTER TABLE storyboard_history ADD COLUMN preview_kind ENUM(''screenshot'',''minimap'') NULL DEFAULT NULL AFTER origin',
  'SELECT 2 /* storyboard_history.preview_kind already exists */'
);

PREPARE _stmt FROM @_sql_history_preview_kind;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;

-- ── Index: storyboard_history(draft_id, origin, id DESC) ─────────────────────
SELECT COUNT(*) INTO @_idx_history_draft_origin_exists
  FROM INFORMATION_SCHEMA.STATISTICS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME   = 'storyboard_history'
   AND INDEX_NAME   = 'idx_storyboard_history_draft_origin';

SET @_sql_idx_history_draft_origin = IF(
  @_idx_history_draft_origin_exists = 0,
  'CREATE INDEX idx_storyboard_history_draft_origin ON storyboard_history (draft_id, origin, id DESC)',
  'SELECT 3 /* idx_storyboard_history_draft_origin already exists */'
);

PREPARE _stmt FROM @_sql_idx_history_draft_origin;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;
