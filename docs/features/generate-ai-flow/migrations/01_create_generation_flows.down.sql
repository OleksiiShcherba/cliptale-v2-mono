-- Rollback for 01_create_generation_flows.up.sql
-- Drops the generation_flows table (and its FK / index, which fall with the table).
-- Safe to run repeatedly.

DROP TABLE IF EXISTS generation_flows;
