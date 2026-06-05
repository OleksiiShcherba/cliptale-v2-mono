-- Rollback: 02_add_history_origin_preview
-- Drops the index and both added columns from storyboard_history (reverse order
-- of the up). Guarded so a partially-applied up can still be rolled back.

-- ── Index ─────────────────────────────────────────────────────────────────────
SELECT COUNT(*) INTO @_idx_history_draft_origin_exists
  FROM INFORMATION_SCHEMA.STATISTICS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME   = 'storyboard_history'
   AND INDEX_NAME   = 'idx_storyboard_history_draft_origin';

SET @_sql_drop_idx = IF(
  @_idx_history_draft_origin_exists > 0,
  'DROP INDEX idx_storyboard_history_draft_origin ON storyboard_history',
  'SELECT 1 /* idx_storyboard_history_draft_origin already absent */'
);

PREPARE _stmt FROM @_sql_drop_idx;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;

-- ── preview_kind ──────────────────────────────────────────────────────────────
SELECT COUNT(*) INTO @_col_history_preview_kind_exists
  FROM INFORMATION_SCHEMA.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME   = 'storyboard_history'
   AND COLUMN_NAME  = 'preview_kind';

SET @_sql_drop_preview_kind = IF(
  @_col_history_preview_kind_exists > 0,
  'ALTER TABLE storyboard_history DROP COLUMN preview_kind',
  'SELECT 2 /* storyboard_history.preview_kind already absent */'
);

PREPARE _stmt FROM @_sql_drop_preview_kind;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;

-- ── origin ────────────────────────────────────────────────────────────────────
SELECT COUNT(*) INTO @_col_history_origin_exists
  FROM INFORMATION_SCHEMA.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME   = 'storyboard_history'
   AND COLUMN_NAME  = 'origin';

SET @_sql_drop_origin = IF(
  @_col_history_origin_exists > 0,
  'ALTER TABLE storyboard_history DROP COLUMN origin',
  'SELECT 3 /* storyboard_history.origin already absent */'
);

PREPARE _stmt FROM @_sql_drop_origin;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;
