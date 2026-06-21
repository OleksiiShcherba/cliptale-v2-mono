/**
 * Repository for the storyboard_pipeline state row (migration 057) — the single
 * server-authoritative pipeline-state row per draft (ADR-0002).
 *
 * Conventions (match storyboardReference.repository.ts):
 *   - Plain SQL via the mysql2 pool (no ORM)
 *   - draft_id scoping on every read/write
 *   - version CAS for every transition (ADR-0007): UPDATE ... WHERE version = ?,
 *     affectedRows 1 = applied, 0 = stale/lost-race
 *   - No mocking; integration tests hit real MySQL
 *
 * Per-unit progress lives in the existing job/block tables; this row holds only the
 * per-draft phase state. The pure transition decisions (what a CAS should do) live in
 * the shared transition module (@ai-video-editor/project-schema, T2).
 */

import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { PipelinePhase, PhaseStatus } from '@ai-video-editor/project-schema';

import { pool } from '@/db/connection.js';

// ── Domain type ─────────────────────────────────────────────────────────────────

export type StoryboardPipelineRow = {
  draftId: string;
  activePhase: PipelinePhase;
  sceneStatus: PhaseStatus;
  referenceDataStatus: PhaseStatus;
  referenceImageStatus: PhaseStatus;
  sceneImageStatus: PhaseStatus;
  activeRunPhase: PipelinePhase | null;
  payloadJson: unknown | null;
  version: number;
  phaseStartedAt: Date | null;
  heartbeatAt: Date | null;
  /** DECIMAL(10,4) — mysql2 returns it as a string to preserve precision. */
  costEstimate: string | null;
  actualCost: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type PipelineRow = RowDataPacket & {
  draft_id: string;
  active_phase: PipelinePhase;
  scene_status: PhaseStatus;
  reference_data_status: PhaseStatus;
  reference_image_status: PhaseStatus;
  scene_image_status: PhaseStatus;
  active_run_phase: PipelinePhase | null;
  payload_json: unknown | null;
  version: number;
  phase_started_at: Date | null;
  heartbeat_at: Date | null;
  cost_estimate: string | null;
  actual_cost: string | null;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
};

/** Whitelisted phase → status-column map (keeps dynamic column names injection-safe). */
const PHASE_STATUS_COLUMN: Record<PipelinePhase, string> = {
  scene: 'scene_status',
  reference_data: 'reference_data_status',
  reference_image: 'reference_image_status',
  scene_image: 'scene_image_status',
};

const SELECT_COLUMNS = `
  draft_id, active_phase, scene_status, reference_data_status, reference_image_status,
  scene_image_status, active_run_phase, payload_json, version, phase_started_at,
  heartbeat_at, cost_estimate, actual_cost, error_message, created_at, updated_at`;

function mapRow(row: PipelineRow): StoryboardPipelineRow {
  return {
    draftId: row.draft_id,
    activePhase: row.active_phase,
    sceneStatus: row.scene_status,
    referenceDataStatus: row.reference_data_status,
    referenceImageStatus: row.reference_image_status,
    sceneImageStatus: row.scene_image_status,
    activeRunPhase: row.active_run_phase,
    payloadJson:
      row.payload_json === null
        ? null
        : typeof row.payload_json === 'string'
          ? JSON.parse(row.payload_json)
          : row.payload_json,
    version: row.version,
    phaseStartedAt: row.phase_started_at,
    heartbeatAt: row.heartbeat_at,
    costEstimate: row.cost_estimate,
    actualCost: row.actual_cost,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── Read ──────────────────────────────────────────────────────────────────────

/** Resume read (AC-05): the single-row PK lookup served on every Step-2 open. */
export async function getPipelineByDraftId(draftId: string): Promise<StoryboardPipelineRow | null> {
  const [rows] = await pool.execute<PipelineRow[]>(
    `SELECT ${SELECT_COLUMNS} FROM storyboard_pipeline WHERE draft_id = ?`,
    [draftId],
  );
  return rows.length > 0 ? mapRow(rows[0]!) : null;
}

// ── Write ───────────────────────────────────────────────────────────────────────

/**
 * Lazily create the pipeline row for a draft (idempotent via INSERT IGNORE — a
 * concurrent first-open does not error). Columns left unset take their SQL defaults
 * (active_phase='scene', all *_status='idle', version=1, active_run_phase=NULL).
 */
export async function insertPipelineRow(params: {
  draftId: string;
  activePhase?: PipelinePhase;
  sceneStatus?: PhaseStatus;
  referenceDataStatus?: PhaseStatus;
  referenceImageStatus?: PhaseStatus;
  sceneImageStatus?: PhaseStatus;
  payloadJson?: unknown | null;
}): Promise<void> {
  await pool.execute<ResultSetHeader>(
    `INSERT IGNORE INTO storyboard_pipeline
       (draft_id, active_phase, scene_status, reference_data_status,
        reference_image_status, scene_image_status, payload_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      params.draftId,
      params.activePhase ?? 'scene',
      params.sceneStatus ?? 'idle',
      params.referenceDataStatus ?? 'idle',
      params.referenceImageStatus ?? 'idle',
      params.sceneImageStatus ?? 'idle',
      params.payloadJson === undefined ? null : JSON.stringify(params.payloadJson),
    ],
  );
}

/**
 * Claim an active run for a phase via the active_run_phase CAS (ADR-0007, AC-14):
 * succeeds only when no run is in flight (active_run_phase IS NULL) AND the version
 * still matches. Sets the run marker, foregrounds the phase, moves it to `running`,
 * stamps phase_started_at + heartbeat_at, and bumps the version.
 * Returns affectedRows: 1 = claimed, 0 = lost the race / already running / stale version.
 */
export async function claimRun(params: {
  draftId: string;
  phase: PipelinePhase;
  currentVersion: number;
  /**
   * Optionally resolve a just-reviewed prior phase to 'completed' in the SAME
   * atomic CAS. Used by confirm-cast: confirming the cast proposal concludes the
   * `reference_data` review (awaiting_review → completed) AT THE SAME TIME it
   * claims the `reference_image` run. Without this the prior phase stays
   * `awaiting_review` forever and the downstream scene_image order-guard
   * (prerequisitesOf → isPhaseResolved) blocks the offer-accept (AC-03/AC-04).
   * The column is resolved from the PHASE_STATUS_COLUMN whitelist (no injection).
   */
  alsoComplete?: PipelinePhase;
}): Promise<number> {
  const statusColumn = PHASE_STATUS_COLUMN[params.phase];
  const alsoColumn = params.alsoComplete ? PHASE_STATUS_COLUMN[params.alsoComplete] : null;
  const [result] = await pool.execute<ResultSetHeader>(
    `UPDATE storyboard_pipeline
        SET active_run_phase = ?,
            active_phase = ?,
            ${statusColumn} = 'running',
            ${alsoColumn ? `${alsoColumn} = 'completed',` : ''}
            phase_started_at = NOW(3),
            heartbeat_at = NOW(3),
            version = version + 1,
            error_message = NULL
      WHERE draft_id = ?
        AND version = ?
        AND active_run_phase IS NULL`,
    [params.phase, params.phase, params.draftId, params.currentVersion],
  );
  return result.affectedRows;
}

/**
 * Apply a transition to the row under a version CAS (ADR-0007). Every supplied field is
 * written; the version is always bumped. Used by Creator-action services and worker
 * completion-hooks (both write the row directly — ADR-0003). Pass `activeRunPhase: null`
 * to release the run marker (advance / cancel / fail), or a phase to set it.
 * Returns affectedRows: 1 = applied, 0 = stale version (caller retries or returns existing).
 */
export async function casUpdateState(params: {
  draftId: string;
  currentVersion: number;
  activePhase?: PipelinePhase;
  /** Which phase sub-state to write (paired with `status`). */
  phase?: PipelinePhase;
  status?: PhaseStatus;
  /** Set or clear (null) the active-run marker. Omit to leave it unchanged. */
  activeRunPhase?: PipelinePhase | null;
  payloadJson?: unknown | null;
  errorMessage?: string | null;
  costEstimate?: string | null;
  actualCost?: string | null;
}): Promise<number> {
  const sets: string[] = ['version = version + 1'];
  const values: Array<string | number | null> = [];

  if (params.activePhase !== undefined) {
    sets.push('active_phase = ?');
    values.push(params.activePhase);
  }
  if (params.phase !== undefined && params.status !== undefined) {
    sets.push(`${PHASE_STATUS_COLUMN[params.phase]} = ?`);
    values.push(params.status);
  }
  if (params.activeRunPhase !== undefined) {
    sets.push('active_run_phase = ?');
    values.push(params.activeRunPhase);
  }
  if (params.payloadJson !== undefined) {
    sets.push('payload_json = ?');
    values.push(params.payloadJson === null ? null : JSON.stringify(params.payloadJson));
  }
  if (params.errorMessage !== undefined) {
    sets.push('error_message = ?');
    values.push(params.errorMessage);
  }
  if (params.costEstimate !== undefined) {
    sets.push('cost_estimate = ?');
    values.push(params.costEstimate);
  }
  if (params.actualCost !== undefined) {
    sets.push('actual_cost = ?');
    values.push(params.actualCost);
  }

  const [result] = await pool.execute<ResultSetHeader>(
    `UPDATE storyboard_pipeline
        SET ${sets.join(',\n            ')}
      WHERE draft_id = ?
        AND version = ?`,
    [...values, params.draftId, params.currentVersion],
  );
  return result.affectedRows;
}

// ── Generation-flow insert (used exclusively by confirmCast T6) ──────────────────

/**
 * Insert a generation_flow row with a pre-seeded canvas. Called by confirmCast when
 * creating reference blocks — each block gets its own flow that the Creator can open
 * to review the auto-generated reference image (MAIN ADJUSTMENT).
 */
export async function insertGenerationFlow(params: {
  flowId: string;
  userId: string;
  title: string;
  canvas: unknown;
}): Promise<void> {
  await pool.execute(
    `INSERT INTO generation_flows (flow_id, user_id, title, canvas)
     VALUES (?, ?, ?, ?)`,
    [params.flowId, params.userId, params.title, JSON.stringify(params.canvas)],
  );
}

// ── Confirm-service helpers (queries used exclusively by confirmCast T6) ─────────

/**
 * Count existing reference blocks for a draft (defensive idempotency guard in confirmCast).
 */
export async function countReferenceBlocksForDraft(draftId: string): Promise<number> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt FROM storyboard_reference_blocks WHERE draft_id = ?`,
    [draftId],
  );
  return Number((rows[0] as { cnt: number }).cnt);
}

/**
 * MAX(music.sort_order) for a draft, or -1 when the draft has no music (AC-09).
 * Used by confirmCast to place reference blocks below all music blocks.
 */
export async function maxMusicSortOrderForDraft(draftId: string): Promise<number> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT COALESCE(MAX(sort_order), -1) AS max_sort
       FROM storyboard_music_blocks
      WHERE draft_id = ?`,
    [draftId],
  );
  return Number((rows[0] as { max_sort: number }).max_sort);
}

// ── Scene-block ID filter (used by confirm service for FK-safe inserts) ─────────

/**
 * Given a list of candidate scene-block IDs and a draft, return only the IDs
 * that actually exist in `storyboard_blocks` for that draft.
 *
 * This pre-filter is required to avoid FK violations: INSERT IGNORE suppresses
 * duplicate-key errors (1062) but NOT foreign-key constraint failures (1452),
 * which would rollback the current statement and leave the whole transaction in
 * an error state. By skipping unknown ids up front we guarantee a clean insert.
 *
 * Returns the subset of `candidateIds` that exist, preserving input order.
 */
export async function filterValidSceneIds(draftId: string, candidateIds: string[]): Promise<string[]> {
  if (candidateIds.length === 0) return [];
  const placeholders = candidateIds.map(() => '?').join(', ');
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id FROM storyboard_blocks WHERE draft_id = ? AND id IN (${placeholders})`,
    [draftId, ...candidateIds],
  );
  const existing = new Set((rows as Array<{ id: string }>).map((r) => r.id));
  return candidateIds.filter((id) => existing.has(id));
}

/**
 * Refresh the heartbeat for the phase currently holding the active run (ADR-0005):
 * real per-unit progress, not wall-clock, keeps a healthy phase out of the reaper's reach.
 * Returns affectedRows: 1 = refreshed, 0 = that phase no longer holds the run.
 */
export async function recordHeartbeat(params: {
  draftId: string;
  phase: PipelinePhase;
}): Promise<number> {
  const [result] = await pool.execute<ResultSetHeader>(
    `UPDATE storyboard_pipeline
        SET heartbeat_at = NOW(3)
      WHERE draft_id = ?
        AND active_run_phase = ?`,
    [params.draftId, params.phase],
  );
  return result.affectedRows;
}

/**
 * The over-bound stuck-phase age query (ADR-0005, AC-12): rows with a run in flight
 * whose heartbeat is older than `boundMinutes`. Served by
 * idx_storyboard_pipeline_active_heartbeat. Source for both the reaper sweep and
 * lazy-on-read release.
 */
export async function findStuckPhases(params: {
  boundMinutes: number;
}): Promise<StoryboardPipelineRow[]> {
  const [rows] = await pool.query<PipelineRow[]>(
    `SELECT ${SELECT_COLUMNS}
       FROM storyboard_pipeline
      WHERE active_run_phase IS NOT NULL
        AND heartbeat_at < (NOW(3) - INTERVAL ? MINUTE)`,
    [params.boundMinutes],
  );
  return rows.map(mapRow);
}
