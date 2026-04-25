-- Migration: 018_add_caption_clip_type
-- Extends the clip type ENUM in project_clips_current to include 'caption'
-- so that caption clips created by useAddCaptionsToTimeline can be persisted.
-- Idempotent: MySQL MODIFY COLUMN is safe to re-run when the column already has
-- the desired definition.

ALTER TABLE project_clips_current
  MODIFY COLUMN type ENUM(
    'video',
    'audio',
    'text-overlay',
    'image',
    'caption'
  ) NOT NULL;
