-- Migration: 007_add_image_clip_type
-- Extends the clip type ENUM in project_clips_current to include 'image'
-- so that static image clips created by useAddAssetToTimeline can be persisted.
-- Idempotent: MySQL MODIFY COLUMN is safe to re-run when the column already has
-- the desired definition.

ALTER TABLE project_clips_current
  MODIFY COLUMN type ENUM(
    'video',
    'audio',
    'text-overlay',
    'image'
  ) NOT NULL;
