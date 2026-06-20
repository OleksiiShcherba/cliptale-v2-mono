-- Rollback for 03_create_motion_graphic_block_snapshots.up.sql
-- Drops the snapshot table. Must run AFTER 04's down (which drops the
-- storyboard_block_media FK that references this table).

DROP TABLE IF EXISTS motion_graphic_block_snapshots;
