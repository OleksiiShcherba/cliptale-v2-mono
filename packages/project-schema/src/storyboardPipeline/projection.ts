/**
 * storyboardPipeline/projection — the SINGLE pure StoryboardPipelineRow → PipelineState
 * wire projection (ADR-0004), shared by BOTH the api controller (T9) and the media-worker
 * realtime publisher (T14).
 *
 * The wire shape is the contract `PipelineState`
 * (docs/features/storyboard-generation-pipeline/contracts/openapi.yaml): snake_case keys,
 * nested `phases`, and a `version` so observer tabs can ignore stale events
 * (version-monotonic convergence, AC-05). Internal columns (phase_started_at, heartbeat_at,
 * actual_cost, created_at) are intentionally NOT exposed (api-sync-report.md).
 *
 * Pure + side-effect-free: no I/O, no DB. The api passes its camelCase repo row directly;
 * the worker builds the same camelCase view from its own DB query.
 */

import type { PipelinePhase, PhaseStatus } from './transition.js';

/** The minimal camelCase view of a storyboard_pipeline row the projection needs. */
export interface PipelineStateRow {
  draftId: string;
  activePhase: PipelinePhase;
  activeRunPhase: PipelinePhase | null;
  sceneStatus: PhaseStatus;
  referenceDataStatus: PhaseStatus;
  referenceImageStatus: PhaseStatus;
  sceneImageStatus: PhaseStatus;
  payloadJson?: unknown | null;
  version: number;
  /** DECIMAL(10,4) — preserved as a string for precision. */
  costEstimate?: string | null;
  errorMessage?: string | null;
  updatedAt?: Date | string | null;
}

/** A single phase's projected sub-state. */
export interface PipelinePhaseState {
  status: PhaseStatus;
}

/**
 * The contract `PipelineState` wire DTO. `version` is always present — it is the
 * monotonic stamp that lets a client ignore a stale realtime event (AC-05, ADR-0004).
 */
export interface PipelineState {
  draft_id: string;
  active_phase: PipelinePhase;
  active_run_phase: PipelinePhase | null;
  phases: {
    scene: PipelinePhaseState;
    reference_data: PipelinePhaseState;
    reference_image: PipelinePhaseState;
    scene_image: PipelinePhaseState;
  };
  payload: unknown | null;
  version: number;
  cost_estimate: string | null;
  error_message: string | null;
  updated_at: string | null;
}

function toIso(v: Date | string | null | undefined): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  return v;
}

/**
 * Project a storyboard_pipeline row to the contract `PipelineState` wire shape.
 * Pure — given the same row it always returns the same DTO, version-stamped.
 */
export function projectPipelineState(row: PipelineStateRow): PipelineState {
  return {
    draft_id: row.draftId,
    active_phase: row.activePhase,
    active_run_phase: row.activeRunPhase,
    phases: {
      scene: { status: row.sceneStatus },
      reference_data: { status: row.referenceDataStatus },
      reference_image: { status: row.referenceImageStatus },
      scene_image: { status: row.sceneImageStatus },
    },
    payload: row.payloadJson ?? null,
    version: row.version,
    cost_estimate: row.costEstimate ?? null,
    error_message: row.errorMessage ?? null,
    updated_at: toIso(row.updatedAt),
  };
}
