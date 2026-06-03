-- Migration: NN_create_flow_files  (STAGED — feature-local ordinal 02)
-- Feature: generate-ai-flow.  STAGED — NOT in the live tree; `implement` promotes it
-- (real number ≈ 047, AFTER 01_create_generation_flows so the FK target exists).
--
-- Creates `flow_files` — the pivot linking a flow to the result assets it produced in
-- the user-owned `files` library (ADR-0007), mirroring `draft_files` (022) verbatim:
--   ON DELETE CASCADE on the flow side  — hard-deleting/purging a flow drops its links.
--   ON DELETE RESTRICT on the file side — a library asset can never be hard-deleted while
--                                         still linked; the asset OUTLIVES the flow (AC-19).
--   deleted_at (mirrors draft_files post-029) — soft-delete is APPLICATION-LEVEL: deleting
--     a flow soft-deletes the flow row AND its flow_files rows (AC-19 "linkage dropped"),
--     while the FK CASCADE/RESTRICT pair is the hard-delete/purge safety net.  The library
--     asset (`files` row) is never touched either way.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS.
--
-- Manual rollback: see 02_create_flow_files.down.sql

CREATE TABLE IF NOT EXISTS flow_files (
  flow_id     CHAR(36)    NOT NULL,
  file_id     CHAR(36)    NOT NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  deleted_at  DATETIME(3) NULL DEFAULT NULL,

  PRIMARY KEY (flow_id, file_id),
  -- FK index for fk_flow_files_file + reverse lookup "is this asset linked to any flow?"
  -- (the composite PK leads with flow_id and does NOT cover file_id alone).
  INDEX idx_flow_files_file (file_id),

  CONSTRAINT fk_flow_files_flow
    FOREIGN KEY (flow_id) REFERENCES generation_flows(flow_id) ON DELETE CASCADE,
  CONSTRAINT fk_flow_files_file
    FOREIGN KEY (file_id) REFERENCES files(file_id) ON DELETE RESTRICT
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;
