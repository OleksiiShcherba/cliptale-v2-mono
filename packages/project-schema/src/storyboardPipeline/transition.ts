import { z } from 'zod';

/**
 * Shared pipeline transition module (ADR-0003).
 *
 * A pure module — no I/O, no DB — imported by BOTH the api (Creator actions:
 * start/cancel/skip/trigger/confirm) and the media-worker (job completion-hooks).
 * It is the single home for:
 *   - the four-phase lifecycle + seven-state sub-state lifecycle,
 *   - the legal sub-state transition table,
 *   - the strict phase-order guard (AC-08),
 *   - the scenes-required guard (AC-15),
 *   - the single-active-run / version-CAS decision (AC-14, ADR-0007).
 *
 * The DB-level CAS (the actual UPDATE ... WHERE version = ?) lives in the repository (T3);
 * this module decides WHAT the CAS should do, given a pure view of the current row.
 */

/** The four pipeline phases, in strict execution order (ADR-0001/0002). */
export const PIPELINE_PHASES = ['scene', 'reference_data', 'reference_image', 'scene_image'] as const;
export type PipelinePhase = (typeof PIPELINE_PHASES)[number];

/**
 * The seven-state sub-state lifecycle shared by every phase (CONTEXT.md / SAD §12).
 * `skipped` is deliberately distinct from `idle` so a prerequisite check can tell an
 * intentional decline from a never-run phase (AC-07).
 */
export const PHASE_STATUSES = [
  'idle',
  'running',
  'awaiting_review',
  'completed',
  'cancelled',
  'failed',
  'skipped',
] as const;
export type PhaseStatus = (typeof PHASE_STATUSES)[number];

export const pipelinePhaseSchema = z.enum(PIPELINE_PHASES);
export const phaseStatusSchema = z.enum(PHASE_STATUSES);

/** The pure projection of the four phase sub-states the guards reason over. */
export interface PipelinePhaseStatuses {
  scene: PhaseStatus;
  reference_data: PhaseStatus;
  reference_image: PhaseStatus;
  scene_image: PhaseStatus;
}

/**
 * Legal sub-state transitions for a single phase.
 *   idle            → running                                   (start)
 *   running         → awaiting_review|completed|failed|cancelled (finish / pause for review / fail / cancel)
 *   awaiting_review → running (confirm/accept) | skipped (dismiss) | cancelled
 *   completed|cancelled|failed|skipped → running                (re-trigger / retry, incremental — ADR-0008)
 */
export const PHASE_STATUS_TRANSITIONS: Record<PhaseStatus, readonly PhaseStatus[]> = {
  idle: ['running'],
  running: ['awaiting_review', 'completed', 'failed', 'cancelled'],
  awaiting_review: ['running', 'skipped', 'cancelled'],
  completed: ['running'],
  cancelled: ['running'],
  failed: ['running'],
  skipped: ['running'],
};

/** True when moving a phase from `from` to `to` is a legal sub-state transition. */
export function canTransition(from: PhaseStatus, to: PhaseStatus): boolean {
  return PHASE_STATUS_TRANSITIONS[from].includes(to);
}

/**
 * A phase counts as "resolved" for a downstream prerequisite check when it has
 * `completed` or been intentionally `skipped` (AC-07). `idle`/`running`/`failed`/
 * `cancelled` are NOT resolved — the downstream phase must wait or be unblocked.
 */
export function isPhaseResolved(status: PhaseStatus): boolean {
  return status === 'completed' || status === 'skipped';
}

/** The phases that must be resolved before `phase` may run, in order. */
export function prerequisitesOf(phase: PipelinePhase): PipelinePhase[] {
  return PIPELINE_PHASES.slice(0, PIPELINE_PHASES.indexOf(phase));
}

/** The two domain-guard codes surfaced to the client (mapped to HTTP in T9). */
export const PIPELINE_GUARD_CODES = {
  PHASE_OUT_OF_ORDER: 'pipeline.phase_out_of_order',
  SCENES_REQUIRED: 'pipeline.scenes_required',
} as const;
export type PipelineGuardCode = (typeof PIPELINE_GUARD_CODES)[keyof typeof PIPELINE_GUARD_CODES];

export type GuardResult =
  | { ok: true }
  | { ok: false; code: PipelineGuardCode; message: string };

const GUARD_OK: GuardResult = { ok: true };

/**
 * Strict phase-order guard (AC-08): a phase may run only once every earlier phase is
 * resolved (completed or skipped). Returns a plain-language, server-authoritative message
 * that the UI renders verbatim (T19).
 */
export function checkPhaseOrder(statuses: PipelinePhaseStatuses, target: PipelinePhase): GuardResult {
  for (const prerequisite of prerequisitesOf(target)) {
    if (!isPhaseResolved(statuses[prerequisite])) {
      return {
        ok: false,
        code: PIPELINE_GUARD_CODES.PHASE_OUT_OF_ORDER,
        message: 'This step can’t start yet — an earlier step has to finish first. The steps run in order.',
      };
    }
  }
  return GUARD_OK;
}

/**
 * Scenes-required guard (AC-15): no phase that consumes scenes (anything past `scene`)
 * may be triggered until scenes have actually been generated. Distinct from the order
 * guard so the Creator gets the specific "generate scenes first" message.
 */
export function checkScenesRequired(target: PipelinePhase, hasScenes: boolean): GuardResult {
  if (target !== 'scene' && !hasScenes) {
    return {
      ok: false,
      code: PIPELINE_GUARD_CODES.SCENES_REQUIRED,
      message: 'Generate the scenes first — there are no scenes yet to build on.',
    };
  }
  return GUARD_OK;
}

/**
 * Single-active-run / version-CAS decision (AC-14, ADR-0007). Given a pure view of the
 * active-run marker + version and the phase the caller wants to run, decide whether to:
 *   - `claim` the run (no run in flight) and bump the version,
 *   - `return_existing` (the same phase is already in flight — idempotent double-trigger),
 *   - report a `conflict` (a different phase holds the active run).
 * The repository performs the actual CAS write under `nextVersion`.
 */
export type RunClaimDecision =
  | { kind: 'claim'; phase: PipelinePhase; nextVersion: number }
  | { kind: 'return_existing'; phase: PipelinePhase }
  | { kind: 'conflict'; activePhase: PipelinePhase };

export function decideRunClaim(input: {
  activeRunPhase: PipelinePhase | null;
  version: number;
  target: PipelinePhase;
}): RunClaimDecision {
  const { activeRunPhase, version, target } = input;
  if (activeRunPhase === null) {
    return { kind: 'claim', phase: target, nextVersion: version + 1 };
  }
  if (activeRunPhase === target) {
    return { kind: 'return_existing', phase: target };
  }
  return { kind: 'conflict', activePhase: activeRunPhase };
}
