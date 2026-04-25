-- Migration: 002_caption_tracks
-- Creates the caption_tracks table that stores Whisper transcript segments
-- (as JSON) per asset and project.
-- Idempotent: safe to run multiple times.

CREATE TABLE IF NOT EXISTS caption_tracks (
  caption_track_id  CHAR(36)        NOT NULL,
  asset_id          CHAR(36)        NOT NULL,
  project_id        CHAR(36)        NOT NULL,
  language          VARCHAR(10)     NOT NULL DEFAULT 'en',
  segments_json     JSON            NOT NULL,
  created_at        DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (caption_track_id),
  INDEX idx_caption_tracks_asset_project (asset_id, project_id)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;
