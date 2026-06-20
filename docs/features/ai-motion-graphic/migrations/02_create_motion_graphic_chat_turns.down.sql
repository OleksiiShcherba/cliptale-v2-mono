-- Rollback for 02_create_motion_graphic_chat_turns.up.sql
-- Drops the chat-history child table. Must run BEFORE 01's down (FK to motion_graphics).

DROP TABLE IF EXISTS motion_graphic_chat_turns;
