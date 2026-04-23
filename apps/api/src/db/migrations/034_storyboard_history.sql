-- Migration: 034_storyboard_history
-- Creates the `storyboard_history` table — server-persisted undo snapshots for
-- the storyboard canvas. Each row stores the full graph state (blocks + edges)
-- as a JSON snapshot at a point in time.
--
-- Design notes:
--   - The application layer caps in-memory history at 50 entries and prunes DB
--     rows beyond the 50 most recent per draft via a DELETE after every insert.
--   - id is BIGINT AUTO_INCREMENT so ORDER BY id gives insertion order without
--     relying on timestamp precision.
--   - Snapshots contain only the graph structure (blocks + edges); media
--     thumbnail data is excluded to keep row size manageable.
--   - The composite index on (draft_id, created_at DESC) supports the common
--     query: "fetch last 50 snapshots for this draft ordered newest-first".
--
-- Idempotent: uses CREATE TABLE IF NOT EXISTS.
--
-- Manual rollback:
--   DROP TABLE IF EXISTS storyboard_history;

CREATE TABLE IF NOT EXISTS storyboard_history (
  id          BIGINT UNSIGNED   NOT NULL AUTO_INCREMENT,
  draft_id    CHAR(36)          NOT NULL,
  snapshot    JSON              NOT NULL,
  created_at  TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_storyboard_history_draft_created (draft_id, created_at DESC)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;
