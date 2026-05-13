-- Migration: 037_storyboard_plan_jobs
-- Persists asynchronous storyboard planning job lifecycle and final validated
-- storyboard plan JSON for generation drafts.
--
-- Durable JSON columns intentionally store stable snapshots only. Signed URLs
-- must not be written to media_context_json; workers should persist file IDs,
-- storage/file identity, transcript snippets, thumbnail availability, and other
-- stable metadata.
--
-- Idempotent: uses CREATE TABLE IF NOT EXISTS.
--
-- Manual rollback:
--   DROP TABLE IF EXISTS storyboard_plan_jobs;

CREATE TABLE IF NOT EXISTS storyboard_plan_jobs (
  job_id                CHAR(36)      NOT NULL,
  draft_id              CHAR(36)      NOT NULL,
  user_id               CHAR(36)      NOT NULL,
  status                ENUM(
                          'queued',
                          'running',
                          'completed',
                          'failed'
                        )             NOT NULL DEFAULT 'queued',
  model                 VARCHAR(128)  NULL,
  prompt_snapshot_json  JSON          NOT NULL,
  media_context_json    JSON          NULL,
  plan_json             JSON          NULL,
  error_message         VARCHAR(512)  NULL,
  created_at            DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at            DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                      ON UPDATE CURRENT_TIMESTAMP(3),
  completed_at          DATETIME(3)   NULL,
  failed_at             DATETIME(3)   NULL,

  PRIMARY KEY (job_id),
  KEY idx_storyboard_plan_jobs_draft_created (draft_id, created_at DESC),
  KEY idx_storyboard_plan_jobs_user_created (user_id, created_at DESC),

  CONSTRAINT fk_storyboard_plan_jobs_draft
    FOREIGN KEY (draft_id) REFERENCES generation_drafts(id) ON DELETE CASCADE,
  CONSTRAINT fk_storyboard_plan_jobs_user
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;
