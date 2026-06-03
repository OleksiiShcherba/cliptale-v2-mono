-- Migration: NN_create_generation_flows  (STAGED — feature-local ordinal 01)
-- Feature: generate-ai-flow.  STAGED under docs/features/generate-ai-flow/migrations/ —
-- NOT yet in the live apps/api/src/db/migrations/ tree.  `implement` promotes this file
-- with the real sequence number (≈ 046) when the feature is actually built.
--
-- Creates `generation_flows` — the owner-scoped, soft-deletable root aggregate of the
-- Generate AI workspace.  The whole node canvas (blocks + edges + positions + per-block
-- params) is stored as ONE JSON document column (ADR-0002); concurrent saves are guarded
-- by a monotonic integer `version` (ADR-0003 / AC-10b — a save carries its parent version,
-- a mismatch is rejected with OptimisticLockError 409).  Result→library links live
-- relationally in `flow_files` (02) + `ai_generation_jobs.flow_id` (03), never in the blob.
--
-- Convention sources (live schema, corroborating architecture-map.md §Migrations):
--   files (021)            — audit columns DATETIME(3), soft-delete deleted_at (029)
--   generation_drafts (019)— user-owned JSON-document shape (prompt_doc JSON NOT NULL)
--   projects (020)         — optimistic-version idiom (OptimisticLockError 409)
--
-- Idempotent: CREATE TABLE IF NOT EXISTS (matches the repo convention).
--
-- Manual rollback: see 01_create_generation_flows.down.sql

CREATE TABLE IF NOT EXISTS generation_flows (
  flow_id     CHAR(36)      NOT NULL,
  user_id     CHAR(36)      NOT NULL,
  title       VARCHAR(255)  NOT NULL DEFAULT 'Untitled flow',
  canvas      JSON          NOT NULL,
  version     INT UNSIGNED  NOT NULL DEFAULT 1,
  created_at  DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                            ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at  DATETIME(3)   NULL DEFAULT NULL,

  PRIMARY KEY (flow_id),
  -- Serves the only non-PK query: list my active flows newest-first
  -- (Flow 3 / AC-04 / AC-10: WHERE user_id=? AND deleted_at IS NULL ORDER BY updated_at DESC).
  -- Leading user_id also satisfies the fk_generation_flows_user FK index requirement.
  INDEX idx_generation_flows_user_active_updated (user_id, deleted_at, updated_at DESC),

  CONSTRAINT fk_generation_flows_user
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;
