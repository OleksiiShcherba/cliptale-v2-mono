-- Migration: 005_project_clips_current
-- Creates the project_clips_current table that tracks the live (mutable) clip
-- state for each project, used by the high-frequency PATCH clip endpoint.
-- Snapshots of clip state are stored separately in project_versions.doc_json.
-- Idempotent: safe to run multiple times (CREATE TABLE IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS project_clips_current (
  clip_id         CHAR(36)          NOT NULL,
  project_id      CHAR(36)          NOT NULL,
  track_id        CHAR(36)          NOT NULL,
  type            ENUM(
                    'video',
                    'audio',
                    'text-overlay'
                  )                 NOT NULL,
  asset_id        CHAR(36)          NULL,
  start_frame     INT UNSIGNED      NOT NULL DEFAULT 0,
  duration_frames INT UNSIGNED      NOT NULL DEFAULT 1,
  trim_in_frames  INT UNSIGNED      NOT NULL DEFAULT 0,
  trim_out_frames INT UNSIGNED      NULL,
  transform_json  JSON              NULL,
  layer           TINYINT UNSIGNED  NOT NULL DEFAULT 0,
  created_at      DATETIME(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                    ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (clip_id),
  INDEX idx_clips_project_id        (project_id),
  INDEX idx_clips_project_track     (project_id, track_id),
  INDEX idx_clips_project_start     (project_id, start_frame)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;
