-- Rollback for 01_create_storyboard_cast_extraction_jobs.up.sql
-- Drops the storyboard_cast_extraction_jobs table (FK / indexes fall with the table).
-- Safe to run repeatedly.

DROP TABLE IF EXISTS storyboard_cast_extraction_jobs;
