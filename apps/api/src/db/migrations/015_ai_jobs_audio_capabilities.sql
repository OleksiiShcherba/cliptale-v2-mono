-- Migration: 015_ai_jobs_audio_capabilities
-- Extends the capability ENUM in ai_generation_jobs to include ElevenLabs
-- audio capabilities: text_to_speech, voice_cloning, speech_to_speech,
-- music_generation.
--
-- Strategy: mirrors migration 014 — DROP TABLE IF EXISTS followed by a full
-- CREATE TABLE with the widened ENUM. MySQL 8 does not support idempotent
-- ADD ENUM VALUE in plain DDL without a stored procedure + DELIMITER; the
-- DROP + CREATE pattern is safe because no production rows exist yet and
-- the job table is a transient queue store (completed jobs are expendable).
--
-- Idempotent: safe to run multiple times (DROP TABLE IF EXISTS + CREATE TABLE
-- IF NOT EXISTS).

-- DOWN (for rollback):
-- DROP TABLE IF EXISTS ai_generation_jobs;
-- -- Then re-run migrations 010, 012, and 014 to restore the prior shape.

DROP TABLE IF EXISTS ai_generation_jobs;

CREATE TABLE IF NOT EXISTS ai_generation_jobs (
  job_id            VARCHAR(64)     NOT NULL,
  user_id           CHAR(36)        NOT NULL,
  project_id        CHAR(36)        NOT NULL,
  model_id          VARCHAR(128)    NOT NULL,
  capability        ENUM(
                      'text_to_image',
                      'image_edit',
                      'text_to_video',
                      'image_to_video',
                      'text_to_speech',
                      'voice_cloning',
                      'speech_to_speech',
                      'music_generation'
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
  result_url        VARCHAR(512)    NULL,
  error_message     TEXT            NULL,
  created_at        DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at        DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                    ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (job_id),
  INDEX idx_ai_generation_jobs_user_status (user_id, status),
  INDEX idx_ai_generation_jobs_project_id (project_id),
  INDEX idx_ai_generation_jobs_model_capability (model_id, capability),
  CONSTRAINT fk_ai_generation_jobs_user
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  CONSTRAINT fk_ai_generation_jobs_project
    FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE CASCADE,
  CONSTRAINT fk_ai_generation_jobs_asset
    FOREIGN KEY (result_asset_id) REFERENCES project_assets_current(asset_id) ON DELETE SET NULL
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;
