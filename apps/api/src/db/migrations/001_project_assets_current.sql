-- Migration: 001_project_assets_current
-- Creates the project_assets_current table that tracks every uploaded asset
-- and its processing lifecycle (pending → processing → ready | error).
-- Idempotent: safe to run multiple times.

CREATE TABLE IF NOT EXISTS project_assets_current (
  asset_id        CHAR(36)          NOT NULL,
  project_id      CHAR(36)          NOT NULL,
  user_id         CHAR(36)          NOT NULL,
  filename        VARCHAR(512)      NOT NULL,
  content_type    VARCHAR(128)      NOT NULL,
  file_size_bytes BIGINT UNSIGNED   NOT NULL,
  storage_uri     VARCHAR(2048)     NOT NULL,
  status          ENUM(
                    'pending',
                    'processing',
                    'ready',
                    'error'
                  )                 NOT NULL DEFAULT 'pending',
  error_message   TEXT              NULL,
  duration_frames INT UNSIGNED      NULL,
  width           INT UNSIGNED      NULL,
  height          INT UNSIGNED      NULL,
  fps             DECIMAL(10, 4)    NULL,
  thumbnail_uri   VARCHAR(2048)     NULL,
  waveform_json   JSON              NULL,
  created_at      DATETIME(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                    ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (asset_id),
  INDEX idx_project_assets_project_status (project_id, status)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;
