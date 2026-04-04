-- Migration: 004_render_jobs
-- Creates the render_jobs table to track background Remotion SSR render requests:
--   render_jobs — one row per export request, tracks status, progress, output location
-- Idempotent: safe to run multiple times (CREATE TABLE IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS render_jobs (
  job_id          CHAR(36)                                              NOT NULL,
  project_id      CHAR(36)                                              NOT NULL,
  version_id      BIGINT UNSIGNED                                       NOT NULL,
  requested_by    VARCHAR(255)                                          NULL,
  status          ENUM('queued','processing','complete','failed')       NOT NULL DEFAULT 'queued',
  progress_pct    TINYINT UNSIGNED                                      NOT NULL DEFAULT 0,
  preset_json     JSON                                                  NOT NULL,
  output_uri      VARCHAR(1024)                                         NULL,
  error_message   TEXT                                                  NULL,
  created_at      DATETIME(3)                                           NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3)                                           NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                                                        ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (job_id),
  INDEX idx_render_jobs_project_id        (project_id),
  INDEX idx_render_jobs_project_status    (project_id, status),
  INDEX idx_render_jobs_requested_by      (requested_by),
  INDEX idx_render_jobs_created_at        (created_at DESC)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;
