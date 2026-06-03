-- Rollback for 02_create_flow_files.up.sql
-- Drops the flow_files pivot (FKs + index fall with the table).
-- The `files` library rows it referenced are untouched (RESTRICT only blocks DROP of a
-- linked file, never a DROP of the pivot itself).  Safe to run repeatedly.

DROP TABLE IF EXISTS flow_files;
