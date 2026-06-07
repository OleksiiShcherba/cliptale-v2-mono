-- Rollback for 03_create_storyboard_reference_scene_links.up.sql
-- Drops the storyboard_reference_scene_links pivot table.
-- Safe to run repeatedly.

DROP TABLE IF EXISTS storyboard_reference_scene_links;
