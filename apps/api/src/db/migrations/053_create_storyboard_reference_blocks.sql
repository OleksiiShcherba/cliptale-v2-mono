-- Migration: 02_create_storyboard_reference_blocks
-- (staged — promoted by `implement` to apps/api/src/db/migrations/053_*.sql)
--
-- One row per confirmed cast entry (character or environment) per draft.
-- Aggregate root for all curation data (ADR-0005: dedicated SQL tables).
--
-- Column notes:
--   flow_id       — nullable FK; NULL = no-flow state (ADR-0006: deleted flow or unlinked copy).
--                   UNIQUE KEY enforces the 1:1 block↔flow invariant; MySQL UNIQUE allows
--                   multiple NULLs, so manually-added blocks-without-flows are fine.
--   sort_order    — cast order used by the rolling-window dispatch (ADR-0003).
--   position_x/y — canvas coordinates per ADR-0005; authoritative over canvas JSON on divergence.
--   window_status — rolling-window state for the first auto-started generation only.
--                   NULL = manually added block (AC-11 no auto-dispatch).
--   first_job_id  — VARCHAR(64) to match ai_generation_jobs.job_id (BullMQ string ID).
--                   FK ON DELETE SET NULL: job deletion does not delete the block.
--   version       — compare-and-set guard for scene-link saves (Override SAD §1 ¶4, critic F1).
--
-- Idempotent: CREATE TABLE IF NOT EXISTS.
--
-- Manual rollback:
--   DROP TABLE IF EXISTS storyboard_reference_blocks;

CREATE TABLE IF NOT EXISTS storyboard_reference_blocks (
  id              CHAR(36)     NOT NULL,
  draft_id        CHAR(36)     NOT NULL,
  flow_id         CHAR(36)     NULL        DEFAULT NULL,
  cast_type       ENUM(
                    'character',
                    'environment'
                  )            NOT NULL,
  name            VARCHAR(255) NOT NULL,
  description     TEXT         NULL,
  sort_order      INT          NOT NULL    DEFAULT 0,
  position_x      FLOAT        NOT NULL    DEFAULT 0,
  position_y      FLOAT        NOT NULL    DEFAULT 0,
  window_status   ENUM(
                    'pending',
                    'running',
                    'done',
                    'failed'
                  )            NULL        DEFAULT NULL,
  first_job_id    VARCHAR(64)  NULL        DEFAULT NULL,
  error_message   VARCHAR(512) NULL,
  version         INT UNSIGNED NOT NULL    DEFAULT 1,
  created_at      DATETIME(3)  NOT NULL    DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3)  NOT NULL    DEFAULT CURRENT_TIMESTAMP(3)
                               ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (id),
  -- Canvas load + star gate (AC-08) + reference boundary (AC-09) + rolling-window dispatch order
  KEY idx_storyboard_reference_blocks_draft_sort   (draft_id, sort_order),
  -- Worker atomic claim: next pending block per draft (ADR-0003 completion-hook)
  KEY idx_storyboard_reference_blocks_draft_window (draft_id, window_status),
  -- 1:1 block↔flow enforcement + draft badge/warning lookup (AC-12, ADR-0010) + FK index coverage
  UNIQUE KEY uq_storyboard_reference_blocks_flow   (flow_id),
  -- FK index for first_job_id
  KEY idx_storyboard_reference_blocks_first_job    (first_job_id),

  CONSTRAINT fk_storyboard_reference_blocks_draft
    FOREIGN KEY (draft_id)     REFERENCES generation_drafts(id)       ON DELETE CASCADE,
  CONSTRAINT fk_storyboard_reference_blocks_flow
    FOREIGN KEY (flow_id)      REFERENCES generation_flows(flow_id)   ON DELETE SET NULL,
  CONSTRAINT fk_storyboard_reference_blocks_first_job
    FOREIGN KEY (first_job_id) REFERENCES ai_generation_jobs(job_id)  ON DELETE SET NULL
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;
