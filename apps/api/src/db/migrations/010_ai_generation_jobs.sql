-- Migration: 010_ai_generation_jobs
-- Creates the ai_generation_jobs table for tracking AI generation job status and results.
-- Each row corresponds to a BullMQ job submitted via the unified generation service.
-- Idempotent: safe to run multiple times (CREATE TABLE IF NOT EXISTS).

-- DOWN (for rollback):
-- DROP TABLE IF EXISTS ai_generation_jobs;

CREATE TABLE IF NOT EXISTS ai_generation_jobs (
  job_id            VARCHAR(64)     NOT NULL,
  user_id           CHAR(36)        NOT NULL,
  project_id        CHAR(36)        NOT NULL,
  type              ENUM(
                      'image',
                      'video',
                      'audio',
                      'text'
                    )               NOT NULL,
  provider          ENUM(
                      'openai',
                      'runway',
                      'stability_ai',
                      'elevenlabs',
                      'kling',
                      'pika',
                      'suno',
                      'replicate'
                    )               NOT NULL,
  prompt            TEXT            NOT NULL,
  options           JSON            NULL,
  status            ENUM(
                      'queued',
                      'processing',
                      'completed',
                      'failed'
                    )               NOT NULL DEFAULT 'queued',
  progress          TINYINT UNSIGNED NOT NULL DEFAULT 0,
  result_asset_id   CHAR(36)        NULL,
  error_message     TEXT            NULL,
  created_at        DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at        DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                    ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (job_id),
  INDEX idx_ai_generation_jobs_user_status (user_id, status),
  INDEX idx_ai_generation_jobs_project_id (project_id),
  CONSTRAINT fk_ai_generation_jobs_user
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  CONSTRAINT fk_ai_generation_jobs_project
    FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE CASCADE,
  CONSTRAINT fk_ai_generation_jobs_asset
    FOREIGN KEY (result_asset_id) REFERENCES project_assets_current(asset_id) ON DELETE SET NULL
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;
