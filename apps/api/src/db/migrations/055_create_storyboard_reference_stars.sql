-- Migration: 04_create_storyboard_reference_stars
-- (staged — promoted by `implement` to apps/api/src/db/migrations/055_*.sql)
--
-- Curation rows: one row per starred result file per reference block (ADR-0009).
-- Stars are versionless atomic toggles — commutative, no optimistic lock
-- (Override SAD §1 ¶4, critic F1). FK ON DELETE CASCADE syncs with
-- result/file deletion (AC-07, quality goal 3).
--
-- is_primary pattern (same as storyboard_music_generation_jobs.active_lock, 045):
--   is_primary = 1    → this is the block's primary star (block preview on canvas)
--   is_primary = NULL → non-primary star (not subject to the unique constraint)
-- MySQL UNIQUE ignores NULL values, so only one (reference_block_id, 1) row can
-- exist per block while unlimited (reference_block_id, NULL) rows co-exist.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS.
--
-- Manual rollback:
--   DROP TABLE IF EXISTS storyboard_reference_stars;

CREATE TABLE IF NOT EXISTS storyboard_reference_stars (
  id                  CHAR(36)    NOT NULL,
  reference_block_id  CHAR(36)    NOT NULL,
  file_id             CHAR(36)    NOT NULL,
  is_primary          TINYINT(1)  NULL DEFAULT NULL,
  created_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (id),
  -- Idempotent star toggle (no duplicates per block+file);
  -- leading block column also covers "all stars for block X" (Flow 2/4: preview, gate, candidates)
  UNIQUE KEY uq_storyboard_reference_stars_block_file (reference_block_id, file_id),
  -- At most one primary star per block (AC-06/AC-07); NULL non-primaries are unrestricted
  UNIQUE KEY uq_storyboard_reference_stars_primary (reference_block_id, is_primary),
  -- FK index + "blocks starring a given file" → sync cleanup on result/file delete (AC-07, ADR-0009)
  KEY idx_storyboard_reference_stars_file (file_id),

  CONSTRAINT fk_storyboard_reference_stars_block
    FOREIGN KEY (reference_block_id)
    REFERENCES storyboard_reference_blocks(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_storyboard_reference_stars_file
    FOREIGN KEY (file_id)
    REFERENCES files(file_id)
    ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;
