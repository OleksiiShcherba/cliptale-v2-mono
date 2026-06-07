-- Rollback for 04_create_storyboard_reference_stars.up.sql
-- Drops the storyboard_reference_stars table (FKs / indexes fall with the table).
-- Safe to run repeatedly.

DROP TABLE IF EXISTS storyboard_reference_stars;
