-- Rollback for 01_create_motion_graphics.up.sql
-- Drops the motion_graphics aggregate-root table.
-- Children (motion_graphic_chat_turns) must be dropped first by their own down
-- migration (02) — promote/rollback ordinal order guarantees that.

DROP TABLE IF EXISTS motion_graphics;
