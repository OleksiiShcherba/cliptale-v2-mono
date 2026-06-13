-- Migration: 01_create_storyboard_pipeline  (STAGED — feature-local ordinal)
-- (staged under docs/features/storyboard-generation-pipeline/migrations/ —
--  `implement` promotes this to apps/api/src/db/migrations/057_storyboard_pipeline.sql.
--  Live tree is already at 056_*, so the SAD §5 hint "056_storyboard_pipeline" is
--  stale; `implement` assigns the real number at promote-time in case another
--  feature promotes first.)
--
-- The single, server-authoritative pipeline-state row per draft (ADR-0002).
-- Read on every Step-2 open to reconstruct the screen (running loader / pending
-- modal) in one PK lookup (§6 NFR: p95 <= 300 ms). Per-unit progress stays in the
-- existing job/block tables (storyboard_blocks, storyboard_reference_blocks.window_status,
-- storyboard_scene_illustration_jobs.status); this row holds only the per-draft phase.
--
-- Column notes:
--   draft_id                — PK *and* FK; one row per draft (ADR-0002, SAD §7). The PK
--                             alone guarantees a single active run per draft, so the
--                             active_lock partial-unique idiom (045/055) collapses to it
--                             here — active_run_phase records WHICH phase holds the run.
--   active_phase            — which phase the UI foregrounds (loader/modal). NOT NULL: a
--                             fresh row auto-starts scene generation (AC-01).
--   <phase>_status          — independent sub-state per phase (ADR-0002). `skipped` is
--                             DISTINCT from `idle` (glossary; AC-07) so a prerequisite
--                             check (AC-08/AC-15) can tell an intentional decline from
--                             never-run. `awaiting_review` = a review modal is pending.
--   active_run_phase        — the active-run marker (ADR-0007): NULL = no run in flight;
--                             a phase value = that phase has an in-flight run. A trigger
--                             claims a run only when this is NULL (CAS), collapsing
--                             double-confirm / second-tab to the existing run (AC-14).
--   payload_json            — UI payload: loader label, or pending-modal data (cast
--                             proposal + reference-image cost estimate / scene-image offer).
--   version                 — compare-and-set guard; every transition increments it
--                             (ADR-0007), mirrors storyboard_reference_blocks.version (053).
--   phase_started_at /      — heartbeat for stuck-release (ADR-0005): a `running` phase
--   heartbeat_at              whose heartbeat age exceeds the 10-min bound is marked failed
--                             by lazy-on-read or the reaper. heartbeat_at tracks real
--                             per-unit progress, not wall-clock alone (§11 false-positive risk).
--   cost_estimate /         — server-computed estimate + instrumented actual for the current
--   actual_cost               expensive-phase run (ADR-0006); DECIMAL(10,4) matches
--                             storyboard_cast_extraction_jobs.aggregate_estimate_credits (052).
--                             The estimate-vs-actual delta KPI is emitted to telemetry at
--                             charge time (§7 metric cost_estimate_actual_delta_pct) — no
--                             per-run SQL history kept (ADR-0002 "no transition history").
--   error_message           — plain-language failure text for a failed phase (AC-12),
--                             matches the job-table convention (037/038/052).
--
-- Idempotent: CREATE TABLE IF NOT EXISTS.
--
-- Manual rollback:
--   DROP TABLE IF EXISTS storyboard_pipeline;

CREATE TABLE IF NOT EXISTS storyboard_pipeline (
  draft_id                CHAR(36)      NOT NULL,
  active_phase            ENUM(
                            'scene',
                            'reference_data',
                            'reference_image',
                            'scene_image'
                          )             NOT NULL DEFAULT 'scene',
  scene_status            ENUM(
                            'idle',
                            'running',
                            'awaiting_review',
                            'completed',
                            'cancelled',
                            'failed',
                            'skipped'
                          )             NOT NULL DEFAULT 'idle',
  reference_data_status   ENUM(
                            'idle',
                            'running',
                            'awaiting_review',
                            'completed',
                            'cancelled',
                            'failed',
                            'skipped'
                          )             NOT NULL DEFAULT 'idle',
  reference_image_status  ENUM(
                            'idle',
                            'running',
                            'awaiting_review',
                            'completed',
                            'cancelled',
                            'failed',
                            'skipped'
                          )             NOT NULL DEFAULT 'idle',
  scene_image_status      ENUM(
                            'idle',
                            'running',
                            'awaiting_review',
                            'completed',
                            'cancelled',
                            'failed',
                            'skipped'
                          )             NOT NULL DEFAULT 'idle',
  active_run_phase        ENUM(
                            'scene',
                            'reference_data',
                            'reference_image',
                            'scene_image'
                          )             NULL     DEFAULT NULL,
  payload_json            JSON          NULL,
  version                 INT UNSIGNED  NOT NULL DEFAULT 1,
  phase_started_at        DATETIME(3)   NULL     DEFAULT NULL,
  heartbeat_at            DATETIME(3)   NULL     DEFAULT NULL,
  cost_estimate           DECIMAL(10,4) NULL     DEFAULT NULL,
  actual_cost             DECIMAL(10,4) NULL     DEFAULT NULL,
  error_message           VARCHAR(512)  NULL,
  created_at              DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at              DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                        ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (draft_id),
  -- Reaper sweep + lazy-on-read stuck-release (ADR-0005, Flow 2): find phases with a
  -- run in flight whose heartbeat is past the 10-min bound.
  --   WHERE active_run_phase IS NOT NULL AND heartbeat_at < (NOW(3) - INTERVAL 10 MINUTE)
  KEY idx_storyboard_pipeline_active_heartbeat (active_run_phase, heartbeat_at),

  -- PK(draft_id) is the FK index (leftmost column) — no separate FK index needed.
  CONSTRAINT fk_storyboard_pipeline_draft
    FOREIGN KEY (draft_id) REFERENCES generation_drafts(id) ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;
