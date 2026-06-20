-- Migration: 04_alter_storyboard_block_media_motion_graphic  (STAGED — feature-local ordinal)
-- (staged under docs/features/ai-motion-graphic/migrations/ — `implement` promotes this to
--  apps/api/src/db/migrations/061_alter_storyboard_block_media_motion_graphic.sql. Real number
--  at promote-time; MUST promote AFTER 03 — the new FK references
--  motion_graphic_block_snapshots(id).)
--
-- Extends the existing storyboard_block_media pivot (033) so a Motion Graphic can attach to a
-- block as a frozen snapshot (ADR-0009). This is the ADR-0009 "Negative consequence": the
-- pivot's file_id is CHAR(36) NOT NULL with a NOT NULL FK to files(file_id); a motion_graphic
-- row has no file row, so file_id must become NULLABLE and the kind carries a snapshot FK
-- instead.
--
-- EXPAND-ONLY, no backfill, no contract step. Every change is backward-compatible:
--   * the new 'motion_graphic' ENUM value is purely additive;
--   * relaxing file_id NOT NULL → NULL does not touch existing rows (image/video/audio rows
--     keep their populated file_id, so old code that always sets file_id keeps working);
--   * the new motion_graphic_snapshot_id column is nullable and unused by existing kinds.
-- There is therefore no half-state to backfill and no DROP-before-deploy hazard — old and new
-- code coexist safely. (The classic expand→backfill→contract is unnecessary here precisely
-- because nothing existing is narrowed or removed.)
--
-- ALTERs follow the repo idiom (026/048/051/056): INFORMATION_SCHEMA guard + PREPARE/EXECUTE,
-- because MySQL 8 has no ADD COLUMN/MODIFY ... IF NOT EXISTS and the in-process runner uses
-- mysql2 multipleStatements. Idempotent: re-running is a no-op.
--
-- Manual rollback: see 04_alter_storyboard_block_media_motion_graphic.down.sql

-- ── 1. media_type ENUM: add 'motion_graphic' ────────────────────────────────────
SELECT COUNT(*) INTO @_enum_has_mg
  FROM INFORMATION_SCHEMA.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME   = 'storyboard_block_media'
   AND COLUMN_NAME  = 'media_type'
   AND COLUMN_TYPE LIKE '%''motion_graphic''%';

SET @_sql_enum = IF(
  @_enum_has_mg = 0,
  'ALTER TABLE storyboard_block_media MODIFY media_type ENUM(''image'',''video'',''audio'',''motion_graphic'') NOT NULL',
  'SELECT 1 /* media_type already has motion_graphic */'
);

PREPARE _stmt FROM @_sql_enum;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;

-- ── 2. file_id NOT NULL → NULL (drop FK, relax, re-add FK) ───────────────────────
-- Captured ONCE before any change: the whole 3-statement unit keys off this flag, so a
-- re-run (already NULLABLE) skips all three.
SELECT IS_NULLABLE INTO @_file_id_nullable
  FROM INFORMATION_SCHEMA.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME   = 'storyboard_block_media'
   AND COLUMN_NAME  = 'file_id';

SET @_sql_drop_file_fk = IF(
  @_file_id_nullable = 'NO',
  'ALTER TABLE storyboard_block_media DROP FOREIGN KEY fk_storyboard_block_media_file',
  'SELECT 1 /* file_id already nullable — skip */'
);
PREPARE _stmt FROM @_sql_drop_file_fk;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;

SET @_sql_mod_file = IF(
  @_file_id_nullable = 'NO',
  'ALTER TABLE storyboard_block_media MODIFY file_id CHAR(36) NULL',
  'SELECT 1 /* file_id already nullable — skip */'
);
PREPARE _stmt FROM @_sql_mod_file;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;

SET @_sql_readd_file_fk = IF(
  @_file_id_nullable = 'NO',
  'ALTER TABLE storyboard_block_media ADD CONSTRAINT fk_storyboard_block_media_file FOREIGN KEY (file_id) REFERENCES files(file_id) ON DELETE CASCADE',
  'SELECT 1 /* file_id already nullable — skip */'
);
PREPARE _stmt FROM @_sql_readd_file_fk;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;

-- ── 3. add motion_graphic_snapshot_id column ─────────────────────────────────────
SELECT COUNT(*) INTO @_col_mg_snap_exists
  FROM INFORMATION_SCHEMA.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME   = 'storyboard_block_media'
   AND COLUMN_NAME  = 'motion_graphic_snapshot_id';

SET @_sql_add_snap_col = IF(
  @_col_mg_snap_exists = 0,
  'ALTER TABLE storyboard_block_media ADD COLUMN motion_graphic_snapshot_id CHAR(36) NULL AFTER file_id',
  'SELECT 1 /* motion_graphic_snapshot_id already exists */'
);
PREPARE _stmt FROM @_sql_add_snap_col;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;

-- ── 4. FK index on the snapshot column ───────────────────────────────────────────
SELECT COUNT(*) INTO @_idx_mg_snap_exists
  FROM INFORMATION_SCHEMA.STATISTICS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME   = 'storyboard_block_media'
   AND INDEX_NAME   = 'idx_storyboard_block_media_mg_snapshot';

SET @_sql_add_snap_idx = IF(
  @_idx_mg_snap_exists = 0,
  'CREATE INDEX idx_storyboard_block_media_mg_snapshot ON storyboard_block_media (motion_graphic_snapshot_id)',
  'SELECT 1 /* idx_storyboard_block_media_mg_snapshot already exists */'
);
PREPARE _stmt FROM @_sql_add_snap_idx;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;

-- ── 5. FK from the pivot to the snapshot table ───────────────────────────────────
SELECT COUNT(*) INTO @_fk_mg_snap_exists
  FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
 WHERE TABLE_SCHEMA    = DATABASE()
   AND TABLE_NAME      = 'storyboard_block_media'
   AND CONSTRAINT_NAME = 'fk_storyboard_block_media_mg_snapshot'
   AND CONSTRAINT_TYPE = 'FOREIGN KEY';

SET @_sql_add_snap_fk = IF(
  @_fk_mg_snap_exists = 0,
  'ALTER TABLE storyboard_block_media ADD CONSTRAINT fk_storyboard_block_media_mg_snapshot FOREIGN KEY (motion_graphic_snapshot_id) REFERENCES motion_graphic_block_snapshots(id) ON DELETE CASCADE',
  'SELECT 1 /* fk_storyboard_block_media_mg_snapshot already exists */'
);
PREPARE _stmt FROM @_sql_add_snap_fk;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;
