-- Migration: 038_storyboard_scene_illustration_jobs
-- Maps storyboard scene blocks to AI image generation jobs.
--
-- A scene block can have multiple illustration attempts over time. The
-- application identifies the latest attempt by (created_at DESC, id DESC), while
-- every attempt remains linked to its AI job for completion reconciliation.
--
-- Status values are UI-facing projections of ai_generation_jobs.status:
--   queued     <- queued
--   running    <- processing
--   ready      <- completed
--   failed     <- failed
--
-- Idempotent: uses CREATE TABLE IF NOT EXISTS.
--
-- Manual rollback:
--   DROP TABLE IF EXISTS storyboard_scene_illustration_jobs;

CREATE TABLE IF NOT EXISTS storyboard_scene_illustration_jobs (
  id              CHAR(36)     NOT NULL,
  draft_id        CHAR(36)     NOT NULL,
  block_id        CHAR(36)     NOT NULL,
  ai_job_id       CHAR(36)     NOT NULL,
  status          ENUM(
                    'queued',
                    'running',
                    'ready',
                    'failed'
                  )            NOT NULL DEFAULT 'queued',
  output_file_id  CHAR(36)     NULL,
  error_message   VARCHAR(512) NULL,
  created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (id),
  UNIQUE KEY uq_storyboard_scene_illustration_ai_job (ai_job_id),
  KEY idx_storyboard_scene_illustration_draft_created (draft_id, created_at DESC),
  KEY idx_storyboard_scene_illustration_block_created (block_id, created_at DESC, id DESC),
  KEY idx_storyboard_scene_illustration_status (status),
  KEY idx_storyboard_scene_illustration_output_file (output_file_id),

  CONSTRAINT fk_storyboard_scene_illustration_draft
    FOREIGN KEY (draft_id)
    REFERENCES generation_drafts(id)
    ON DELETE CASCADE,

  CONSTRAINT fk_storyboard_scene_illustration_block
    FOREIGN KEY (block_id)
    REFERENCES storyboard_blocks(id)
    ON DELETE CASCADE,

  CONSTRAINT fk_storyboard_scene_illustration_ai_job
    FOREIGN KEY (ai_job_id)
    REFERENCES ai_generation_jobs(job_id)
    ON DELETE CASCADE,

  CONSTRAINT fk_storyboard_scene_illustration_output_file
    FOREIGN KEY (output_file_id)
    REFERENCES files(file_id)
    ON DELETE SET NULL
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;
