-- Migration: 014_ai_jobs_fal_reshape
-- Reshapes ai_generation_jobs for the unified fal.ai integration.
-- Drops the legacy per-provider columns (`provider`, `type`) and introduces
-- `model_id` + `capability`, which the fal.ai model catalog will reference.
--
-- Strategy: DROP TABLE IF EXISTS followed by a full CREATE TABLE with the new
-- shape. This choice is intentional for two reasons:
--   1. The ticket authorizes discarding pre-launch dev rows; no data needs to
--      be preserved across the reshape.
--   2. Expressing guarded ALTERs idempotently in plain DDL on MySQL 8 requires
--      a stored procedure, but mysql2's multipleStatements splits on `;` and
--      cannot carry a DELIMITER-bracketed procedure body. DROP + CREATE is
--      the cleanest re-runnable form that preserves all original foreign keys
--      and indexes verbatim.
--
-- All original columns except `provider` and `type` are preserved with their
-- original types, nullability, and defaults (including `result_url` added by
-- migration 012). All original indexes and foreign key constraints from
-- migration 010 are re-declared verbatim. A new composite index on
-- (model_id, capability) is added for catalog-grouped lookups.
--
-- Idempotent: safe to run multiple times (DROP TABLE IF EXISTS + CREATE TABLE
-- IF NOT EXISTS).

-- DOWN (for rollback):
-- DROP TABLE IF EXISTS ai_generation_jobs;
-- -- Then re-run migrations 010 and 012 to restore the legacy shape.

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
                      'image_to_video'
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
