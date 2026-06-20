-- Migration: 063_add_motion_graphic_clip_type
-- Extends the clip type ENUM in project_clips_current to include 'motion-graphic'
-- so that an AI-authored Motion Graphic placed on a project timeline (editor
-- integration of the ai-motion-graphic feature) can be persisted as a clip row.
--
-- The clip's frozen TSX code snapshot + geometry live in the project_versions
-- doc_json snapshot (authoritative for clip content); this row only mirrors the
-- mutable timeline fields (track/start/duration) for the high-frequency PATCH
-- drag/trim endpoint, exactly like text-overlay and caption clips.
--
-- Idempotent: MySQL MODIFY COLUMN is safe to re-run when the column already has
-- the desired definition.

ALTER TABLE project_clips_current
  MODIFY COLUMN type ENUM(
    'video',
    'audio',
    'text-overlay',
    'image',
    'caption',
    'motion-graphic'
  ) NOT NULL;
