/**
 * Repository for storyboard-reference-flows domain:
 *   - storyboard_cast_extraction_jobs  (AC-01)
 *   - storyboard_reference_blocks      (AC-03, AC-04)
 *
 * Conventions:
 *   - Plain SQL via mysql2 pool (no ORM)
 *   - owner / draft scoping on every read
 *   - No mocking; integration tests hit real MySQL
 */

import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';

import { pool } from '@/db/connection.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type CastExtractionJobStatus = 'queued' | 'running' | 'completed' | 'failed';

export type CastExtractionJob = {
  id: string;
  draftId: string;
  userId: string;
  status: CastExtractionJobStatus;
  proposalJson: unknown | null;
  aggregateEstimateCredits: string | null;
  errorMessage: string | null;
  completedAt: Date | null;
  failedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ReferenceBlockWindowStatus = 'pending' | 'running' | 'done' | 'failed';

export type ReferenceBlock = {
  id: string;
  draftId: string;
  flowId: string | null;
  castType: 'character' | 'environment';
  name: string;
  description: string | null;
  sortOrder: number;
  positionX: number;
  positionY: number;
  windowStatus: ReferenceBlockWindowStatus | null;
  firstJobId: string | null;
  errorMessage: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

// ── Row types ─────────────────────────────────────────────────────────────────

type CastExtractionJobRow = RowDataPacket & {
  id: string;
  draft_id: string;
  user_id: string;
  status: CastExtractionJobStatus;
  proposal_json: unknown | null;
  aggregate_estimate_credits: string | null;
  error_message: string | null;
  completed_at: Date | null;
  failed_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

type ReferenceBlockRow = RowDataPacket & {
  id: string;
  draft_id: string;
  flow_id: string | null;
  cast_type: 'character' | 'environment';
  name: string;
  description: string | null;
  sort_order: number;
  position_x: number;
  position_y: number;
  window_status: ReferenceBlockWindowStatus | null;
  first_job_id: string | null;
  error_message: string | null;
  version: number;
  created_at: Date;
  updated_at: Date;
};

// ── Mappers ───────────────────────────────────────────────────────────────────

function mapJobRow(row: CastExtractionJobRow): CastExtractionJob {
  return {
    id: row.id,
    draftId: row.draft_id,
    userId: row.user_id,
    status: row.status,
    proposalJson: row.proposal_json === null
      ? null
      : (typeof row.proposal_json === 'string' ? JSON.parse(row.proposal_json) : row.proposal_json),
    aggregateEstimateCredits: row.aggregate_estimate_credits,
    errorMessage: row.error_message,
    completedAt: row.completed_at,
    failedAt: row.failed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapBlockRow(row: ReferenceBlockRow): ReferenceBlock {
  return {
    id: row.id,
    draftId: row.draft_id,
    flowId: row.flow_id,
    castType: row.cast_type,
    name: row.name,
    description: row.description,
    sortOrder: row.sort_order,
    positionX: row.position_x,
    positionY: row.position_y,
    windowStatus: row.window_status,
    firstJobId: row.first_job_id,
    errorMessage: row.error_message,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── Cast Extraction Jobs (AC-01) ──────────────────────────────────────────────

/**
 * Insert a new cast extraction job in 'queued' status.
 */
export async function createCastExtractionJob(params: {
  id: string;
  draftId: string;
  userId: string;
}): Promise<CastExtractionJob> {
  await pool.execute(
    `INSERT INTO storyboard_cast_extraction_jobs (id, draft_id, user_id, status)
     VALUES (?, ?, ?, 'queued')`,
    [params.id, params.draftId, params.userId],
  );

  const [rows] = await pool.execute<CastExtractionJobRow[]>(
    `SELECT id, draft_id, user_id, status, proposal_json, aggregate_estimate_credits,
            error_message, completed_at, failed_at, created_at, updated_at
       FROM storyboard_cast_extraction_jobs
      WHERE id = ?`,
    [params.id],
  );

  return mapJobRow(rows[0]!);
}

/**
 * Find the most recent cast extraction job for a draft, owner-scoped.
 * Returns null if no job exists for this (draft, user) pair.
 */
export async function findLatestCastExtractionJobForDraft(params: {
  draftId: string;
  userId: string;
}): Promise<CastExtractionJob | null> {
  const [rows] = await pool.execute<CastExtractionJobRow[]>(
    `SELECT id, draft_id, user_id, status, proposal_json, aggregate_estimate_credits,
            error_message, completed_at, failed_at, created_at, updated_at
       FROM storyboard_cast_extraction_jobs
      WHERE draft_id = ?
        AND user_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT 1`,
    [params.draftId, params.userId],
  );
  return rows.length ? mapJobRow(rows[0]!) : null;
}

/**
 * Transition a job to 'completed' or 'failed'.
 */
export async function updateCastExtractionJobStatus(params: {
  id: string;
  status: 'completed' | 'failed';
  proposalJson?: string | null;
  aggregateEstimateCredits?: string | null;
  errorMessage?: string | null;
}): Promise<void> {
  if (params.status === 'completed') {
    await pool.execute(
      `UPDATE storyboard_cast_extraction_jobs
          SET status = 'completed',
              proposal_json = ?,
              aggregate_estimate_credits = ?,
              error_message = NULL,
              completed_at = NOW(3),
              failed_at = NULL
        WHERE id = ?`,
      [
        params.proposalJson ?? null,
        params.aggregateEstimateCredits ?? null,
        params.id,
      ],
    );
  } else {
    await pool.execute(
      `UPDATE storyboard_cast_extraction_jobs
          SET status = 'failed',
              error_message = ?,
              failed_at = NOW(3)
        WHERE id = ?`,
      [params.errorMessage ?? null, params.id],
    );
  }
}

// ── Reference Blocks (AC-03, AC-04) ──────────────────────────────────────────

/**
 * Insert a new reference block.
 * Manually-added blocks (AC-11) have windowStatus = null (default).
 */
export async function createReferenceBlock(params: {
  id: string;
  draftId: string;
  castType: 'character' | 'environment';
  name: string;
  sortOrder: number;
  windowStatus?: ReferenceBlockWindowStatus | null;
  description?: string | null;
  positionX?: number;
  positionY?: number;
}): Promise<ReferenceBlock> {
  await pool.execute(
    `INSERT INTO storyboard_reference_blocks
       (id, draft_id, cast_type, name, sort_order, window_status, description, position_x, position_y)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      params.id,
      params.draftId,
      params.castType,
      params.name,
      params.sortOrder,
      params.windowStatus ?? null,
      params.description ?? null,
      params.positionX ?? 0,
      params.positionY ?? 0,
    ],
  );

  const [rows] = await pool.execute<ReferenceBlockRow[]>(
    `SELECT id, draft_id, flow_id, cast_type, name, description, sort_order,
            position_x, position_y, window_status, first_job_id, error_message, version,
            created_at, updated_at
       FROM storyboard_reference_blocks
      WHERE id = ?`,
    [params.id],
  );

  return mapBlockRow(rows[0]!);
}

/**
 * List all reference blocks for a draft in cast order (sort_order ASC), draft + owner scoped.
 */
export async function listReferenceBlocksByDraftId(params: {
  draftId: string;
  userId: string;
}): Promise<ReferenceBlock[]> {
  // Owner scope via draft ownership: generation_drafts.user_id
  const [rows] = await pool.execute<ReferenceBlockRow[]>(
    `SELECT b.id, b.draft_id, b.flow_id, b.cast_type, b.name, b.description,
            b.sort_order, b.position_x, b.position_y, b.window_status,
            b.first_job_id, b.error_message, b.version, b.created_at, b.updated_at
       FROM storyboard_reference_blocks b
       JOIN generation_drafts d ON d.id = b.draft_id
      WHERE b.draft_id = ?
        AND d.user_id = ?
      ORDER BY b.sort_order ASC`,
    [params.draftId, params.userId],
  );
  return rows.map(mapBlockRow);
}

/**
 * Atomically claim the next 'pending' block for a draft (rolling window, ADR-0003).
 *
 * Uses a transaction with SELECT … FOR UPDATE SKIP LOCKED to identify the exact
 * candidate row, then updates only that row's window_status to 'running'.
 * This guarantees that when multiple workers call concurrently — which is the normal
 * N-concurrent-generation scenario (AC-03, ADR-0003) — each caller claims a DISTINCT
 * row and can reliably re-read the row it just claimed (by id).
 *
 * Previous implementation used UPDATE … ORDER BY … LIMIT 1 (atomic claim) but then
 * re-fetched with WHERE window_status='running' ORDER BY sort_order LIMIT 1, which
 * returns the lowest-sort_order running block — not necessarily the one this call
 * just claimed — causing wrong/duplicate dispatches when N>1 blocks are running.
 *
 * Returns the claimed block (with windowStatus='running') or null if none were pending.
 */
export async function claimNextPendingBlock(params: {
  draftId: string;
}): Promise<ReferenceBlock | null> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Lock exactly one pending candidate row; SKIP LOCKED ensures concurrent callers
    // each get a DIFFERENT row (or null if no unlocked pending row is available).
    const [candidates] = await conn.execute<ReferenceBlockRow[]>(
      `SELECT id, draft_id, flow_id, cast_type, name, description, sort_order,
              position_x, position_y, window_status, first_job_id, error_message, version,
              created_at, updated_at
         FROM storyboard_reference_blocks
        WHERE draft_id = ?
          AND window_status = 'pending'
        ORDER BY sort_order ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED`,
      [params.draftId],
    );

    if (!candidates.length) {
      await conn.rollback();
      return null;
    }

    const candidate = candidates[0]!;

    // Claim this specific row by id — safe because we hold the row lock.
    await conn.execute(
      `UPDATE storyboard_reference_blocks
          SET window_status = 'running'
        WHERE id = ?`,
      [candidate.id],
    );

    await conn.commit();

    // Return the mapped block with the updated status applied in-memory
    // (avoids a second round-trip; the UPDATE is unconditional on the locked row).
    return mapBlockRow({ ...candidate, window_status: 'running' });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * CAS (compare-and-set) version increment on a reference block.
 * Increments version only when the current DB version matches currentVersion.
 * Returns affectedRows: 1 on success, 0 on stale version conflict (→ 409 in service layer).
 */
export async function casIncrementBlockVersion(params: {
  id: string;
  draftId: string;
  currentVersion: number;
}): Promise<number> {
  const [result] = await pool.execute<ResultSetHeader>(
    `UPDATE storyboard_reference_blocks
        SET version = version + 1
      WHERE id = ?
        AND draft_id = ?
        AND version = ?`,
    [params.id, params.draftId, params.currentVersion],
  );
  return result.affectedRows;
}

/**
 * Update window_status of a reference block (e.g. running → done / failed).
 * Returns affectedRows: 1 on success, 0 if not found.
 */
export async function updateReferenceBlockWindowStatus(params: {
  id: string;
  draftId: string;
  windowStatus: ReferenceBlockWindowStatus;
  errorMessage?: string | null;
}): Promise<number> {
  const [result] = await pool.execute<ResultSetHeader>(
    `UPDATE storyboard_reference_blocks
        SET window_status = ?,
            error_message = ?
      WHERE id = ?
        AND draft_id = ?`,
    [
      params.windowStatus,
      params.errorMessage ?? null,
      params.id,
      params.draftId,
    ],
  );
  return result.affectedRows;
}
