-- Rollback for 02_create_storyboard_reference_blocks.up.sql
-- Drops the storyboard_reference_blocks table (FKs / indexes fall with the table).
-- NOTE: drop 03 and 04 first — they FK into this table.
-- Safe to run repeatedly.

DROP TABLE IF EXISTS storyboard_reference_blocks;
