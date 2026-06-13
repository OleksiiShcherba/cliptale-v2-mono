-- Down: 01_create_storyboard_pipeline  (STAGED — feature-local ordinal)
-- Reverses 01_create_storyboard_pipeline.up.sql. Drops the single pipeline-state
-- table; per-unit progress in the existing job/block tables is untouched.

DROP TABLE IF EXISTS storyboard_pipeline;
