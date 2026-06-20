-- Rollback for 04_alter_storyboard_block_media_motion_graphic.up.sql
-- Reverses the pivot extension, restoring storyboard_block_media to its 033 shape.
--
-- PRECONDITION: any rows with media_type = 'motion_graphic' (and any NULL file_id) MUST be
-- deleted first — step 4 restores file_id to NOT NULL and step 5 removes the ENUM value, both
-- of which fail if a motion_graphic row still exists. Run, if needed:
--   DELETE FROM storyboard_block_media WHERE media_type = 'motion_graphic';
--
-- ALTERs follow the same INFORMATION_SCHEMA-guarded PREPARE/EXECUTE idiom. Must run BEFORE
-- 03's down (this drops the FK that references motion_graphic_block_snapshots).

-- ── 1. drop the snapshot FK ──────────────────────────────────────────────────────
SELECT COUNT(*) INTO @_fk_mg_snap_exists
  FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
 WHERE TABLE_SCHEMA    = DATABASE()
   AND TABLE_NAME      = 'storyboard_block_media'
   AND CONSTRAINT_NAME = 'fk_storyboard_block_media_mg_snapshot'
   AND CONSTRAINT_TYPE = 'FOREIGN KEY';
SET @_sql = IF(@_fk_mg_snap_exists = 1,
  'ALTER TABLE storyboard_block_media DROP FOREIGN KEY fk_storyboard_block_media_mg_snapshot',
  'SELECT 1');
PREPARE _stmt FROM @_sql; EXECUTE _stmt; DEALLOCATE PREPARE _stmt;

-- ── 2. drop the snapshot index ───────────────────────────────────────────────────
SELECT COUNT(*) INTO @_idx_mg_snap_exists
  FROM INFORMATION_SCHEMA.STATISTICS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME   = 'storyboard_block_media'
   AND INDEX_NAME   = 'idx_storyboard_block_media_mg_snapshot';
SET @_sql = IF(@_idx_mg_snap_exists = 1,
  'DROP INDEX idx_storyboard_block_media_mg_snapshot ON storyboard_block_media',
  'SELECT 1');
PREPARE _stmt FROM @_sql; EXECUTE _stmt; DEALLOCATE PREPARE _stmt;

-- ── 3. drop the snapshot column ──────────────────────────────────────────────────
SELECT COUNT(*) INTO @_col_mg_snap_exists
  FROM INFORMATION_SCHEMA.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME   = 'storyboard_block_media'
   AND COLUMN_NAME  = 'motion_graphic_snapshot_id';
SET @_sql = IF(@_col_mg_snap_exists = 1,
  'ALTER TABLE storyboard_block_media DROP COLUMN motion_graphic_snapshot_id',
  'SELECT 1');
PREPARE _stmt FROM @_sql; EXECUTE _stmt; DEALLOCATE PREPARE _stmt;

-- ── 4. restore file_id NOT NULL (drop FK, tighten, re-add FK) ─────────────────────
SELECT IS_NULLABLE INTO @_file_id_nullable
  FROM INFORMATION_SCHEMA.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME   = 'storyboard_block_media'
   AND COLUMN_NAME  = 'file_id';

SET @_sql = IF(@_file_id_nullable = 'YES',
  'ALTER TABLE storyboard_block_media DROP FOREIGN KEY fk_storyboard_block_media_file', 'SELECT 1');
PREPARE _stmt FROM @_sql; EXECUTE _stmt; DEALLOCATE PREPARE _stmt;

SET @_sql = IF(@_file_id_nullable = 'YES',
  'ALTER TABLE storyboard_block_media MODIFY file_id CHAR(36) NOT NULL', 'SELECT 1');
PREPARE _stmt FROM @_sql; EXECUTE _stmt; DEALLOCATE PREPARE _stmt;

SET @_sql = IF(@_file_id_nullable = 'YES',
  'ALTER TABLE storyboard_block_media ADD CONSTRAINT fk_storyboard_block_media_file FOREIGN KEY (file_id) REFERENCES files(file_id) ON DELETE CASCADE', 'SELECT 1');
PREPARE _stmt FROM @_sql; EXECUTE _stmt; DEALLOCATE PREPARE _stmt;

-- ── 5. shrink media_type ENUM back to the 033 set ────────────────────────────────
SELECT COUNT(*) INTO @_enum_has_mg
  FROM INFORMATION_SCHEMA.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME   = 'storyboard_block_media'
   AND COLUMN_NAME  = 'media_type'
   AND COLUMN_TYPE LIKE '%''motion_graphic''%';
SET @_sql = IF(@_enum_has_mg = 1,
  'ALTER TABLE storyboard_block_media MODIFY media_type ENUM(''image'',''video'',''audio'') NOT NULL',
  'SELECT 1');
PREPARE _stmt FROM @_sql; EXECUTE _stmt; DEALLOCATE PREPARE _stmt;
