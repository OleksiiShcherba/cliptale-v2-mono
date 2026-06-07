-- Migration: 03_create_storyboard_reference_scene_links
-- (staged — promoted by `implement` to apps/api/src/db/migrations/054_*.sql)
--
-- Pivot table: individual (NOT range-based) block ↔ scene associations (ADR-0005).
-- Both FKs cascade: deleting a reference block or a scene scene block removes the
-- link row — no dangling links ever remain (AC-10b, quality goal 3).
--
-- Composite PK (reference_block_id, scene_block_id) serves both the "all links for
-- block X" direction (leading column) and the block-version compare-and-set
-- save (the full pivot is replaced atomically in the service layer).
--
-- Idempotent: CREATE TABLE IF NOT EXISTS.
--
-- Manual rollback:
--   DROP TABLE IF EXISTS storyboard_reference_scene_links;

CREATE TABLE IF NOT EXISTS storyboard_reference_scene_links (
  reference_block_id  CHAR(36)    NOT NULL,
  scene_block_id      CHAR(36)    NOT NULL,
  created_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (reference_block_id, scene_block_id),
  -- "All blocks linked to scene X" (scoped star gate AC-08b; reference boundary AC-09;
  -- cascade on scene delete AC-10b Flow 6) + FK index coverage for scene_block_id
  KEY idx_storyboard_reference_scene_links_scene (scene_block_id),

  CONSTRAINT fk_storyboard_ref_scene_links_block
    FOREIGN KEY (reference_block_id)
    REFERENCES storyboard_reference_blocks(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_storyboard_ref_scene_links_scene
    FOREIGN KEY (scene_block_id)
    REFERENCES storyboard_blocks(id)
    ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;
