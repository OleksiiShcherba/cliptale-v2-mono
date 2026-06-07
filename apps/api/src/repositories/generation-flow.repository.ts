/**
 * Repository for `generation_flows` — owner-scoped CRUD + optimistic-version canvas save.
 *
 * Design decisions (ADR-0002, ADR-0003, data-model.md):
 * - Every read/write includes `AND user_id = ?` (AC-04 owner scope).
 * - Soft-delete via `deleted_at IS NULL` filter (convention from migration 029).
 * - Canvas is persisted as a JSON string; mysql2 may return it pre-parsed — we handle both.
 * - `saveFlowCanvas` carries a `parentVersion` guard: the UPDATE matches only when
 *   `version = parentVersion` and atomically sets `version = version + 1`.
 *   A zero-affected-rows result is the conflict signal — the service layer raises 409.
 *
 * Pattern: matches asset.repository.ts / generationDraft.repository.ts — pool.execute,
 * RowDataPacket row types, camelCase result mapping, no ORM.
 */
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { pool } from '@/db/connection.js';
import type { FlowCanvas } from '@ai-video-editor/project-schema';

// ── Types ─────────────────────────────────────────────────────────────────────

/** Full generation_flow record as returned by the repository. */
export type FlowRecord = {
  flowId: string;
  userId: string;
  title: string;
  canvas: FlowCanvas;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

/** Parameters for creating a new flow. */
export type CreateFlowParams = {
  flowId: string;
  userId: string;
  title: string;
  canvas: FlowCanvas;
};

/** Parameters for saving canvas with optimistic version guard. */
export type SaveFlowCanvasParams = {
  flowId: string;
  userId: string;
  canvas: FlowCanvas;
  /** The version the client last read — UPDATE only proceeds if DB version still matches. */
  parentVersion: number;
};

/** Result of a canvas save — distinguishes commit from conflict without throwing. */
export type SaveFlowCanvasResult =
  | { saved: true; flow: FlowRecord }
  | { saved: false; flow: null };

// ── Internal DB row type ──────────────────────────────────────────────────────

type FlowRow = RowDataPacket & {
  flow_id: string;
  user_id: string;
  title: string;
  /** mysql2 may return a JSON column as a pre-parsed object or as a raw JSON string. */
  canvas: FlowCanvas | string;
  version: number;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

// ── Mapping ───────────────────────────────────────────────────────────────────

function mapRowToFlow(row: FlowRow): FlowRecord {
  return {
    flowId: row.flow_id,
    userId: row.user_id,
    title: row.title,
    canvas: typeof row.canvas === 'string'
      ? (JSON.parse(row.canvas) as FlowCanvas)
      : row.canvas,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? null,
  };
}

// ── Read-back helper ──────────────────────────────────────────────────────────

/**
 * Reads a single flow row by its PK (no owner filter — used internally after
 * a write that already confirmed ownership via the WHERE clause).
 */
async function readFlowByPk(flowId: string): Promise<FlowRecord | null> {
  const [rows] = await pool.execute<FlowRow[]>(
    `SELECT flow_id, user_id, title, canvas, version, created_at, updated_at, deleted_at
       FROM generation_flows
      WHERE flow_id = ?
      LIMIT 1`,
    [flowId],
  );
  return rows.length ? mapRowToFlow(rows[0]!) : null;
}

// ── createFlow ────────────────────────────────────────────────────────────────

/**
 * Inserts a new generation_flows row.
 * `version` defaults to 1 via the DB DEFAULT; we read it back via SELECT.
 */
export async function createFlow(params: CreateFlowParams): Promise<FlowRecord> {
  const { flowId, userId, title, canvas } = params;

  await pool.execute<ResultSetHeader>(
    `INSERT INTO generation_flows (flow_id, user_id, title, canvas)
     VALUES (?, ?, ?, ?)`,
    [flowId, userId, title, JSON.stringify(canvas)],
  );

  const flow = await readFlowByPk(flowId);
  if (!flow) {
    throw new Error(`generation_flows row not found after insert: ${flowId}`);
  }
  return flow;
}

// ── findFlowById ──────────────────────────────────────────────────────────────

/**
 * Returns a single non-deleted flow owned by `userId`, or null.
 * Owner-scoped: WHERE flow_id = ? AND user_id = ? AND deleted_at IS NULL.
 * Non-owner and absent are indistinguishable (both return null) — AC-04.
 */
export async function findFlowById(flowId: string, userId: string): Promise<FlowRecord | null> {
  const [rows] = await pool.execute<FlowRow[]>(
    `SELECT flow_id, user_id, title, canvas, version, created_at, updated_at, deleted_at
       FROM generation_flows
      WHERE flow_id = ? AND user_id = ? AND deleted_at IS NULL
      LIMIT 1`,
    [flowId, userId],
  );
  return rows.length ? mapRowToFlow(rows[0]!) : null;
}

// ── findFlowsByUserId ─────────────────────────────────────────────────────────

/**
 * Returns all non-deleted flows owned by `userId`, newest-first (updated_at DESC).
 * Owner-scoped — AC-04 / AC-10.
 */
export async function findFlowsByUserId(userId: string): Promise<FlowRecord[]> {
  const [rows] = await pool.execute<FlowRow[]>(
    `SELECT flow_id, user_id, title, canvas, version, created_at, updated_at, deleted_at
       FROM generation_flows
      WHERE user_id = ? AND deleted_at IS NULL
      ORDER BY updated_at DESC, flow_id DESC`,
    [userId],
  );
  return rows.map(mapRowToFlow);
}

// ── findDraftBadgesByFlowIds ──────────────────────────────────────────────────

/**
 * For a list of flow IDs, returns the draft_id of the reference block that links
 * each flow (AC-12, ADR-0010: badge is derived from the block→flow JOIN, never stored).
 *
 * Returns a Map<flowId, draftId>. Flows with no linked block are absent from the map
 * (not present → badge is null).
 */
export async function findDraftBadgesByFlowIds(
  flowIds: string[],
): Promise<Map<string, string>> {
  if (flowIds.length === 0) return new Map();

  type BadgeRow = RowDataPacket & { flow_id: string; draft_id: string };
  const placeholders = flowIds.map(() => '?').join(',');
  const [rows] = await pool.execute<BadgeRow[]>(
    `SELECT flow_id, draft_id
       FROM storyboard_reference_blocks
      WHERE flow_id IN (${placeholders})`,
    flowIds,
  );

  const result = new Map<string, string>();
  for (const row of rows) {
    result.set(row.flow_id, row.draft_id);
  }
  return result;
}

// ── renameFlow ────────────────────────────────────────────────────────────────

/**
 * Updates the title of a non-deleted flow owned by `userId`.
 * Returns true when a row was updated, false when no row matched (wrong owner /
 * missing / soft-deleted).
 */
export async function renameFlow(
  flowId: string,
  userId: string,
  title: string,
): Promise<boolean> {
  const [result] = await pool.execute<ResultSetHeader>(
    `UPDATE generation_flows
        SET title = ?, updated_at = NOW(3)
      WHERE flow_id = ? AND user_id = ? AND deleted_at IS NULL`,
    [title, flowId, userId],
  );
  return result.affectedRows > 0;
}

// ── softDeleteFlow ────────────────────────────────────────────────────────────

/**
 * Soft-deletes a flow by setting `deleted_at = NOW(3)`.
 * Owner-scoped — only the owner can delete.
 * Returns true when a row was updated, false otherwise.
 */
export async function softDeleteFlow(flowId: string, userId: string): Promise<boolean> {
  const [result] = await pool.execute<ResultSetHeader>(
    `UPDATE generation_flows
        SET deleted_at = NOW(3)
      WHERE flow_id = ? AND user_id = ? AND deleted_at IS NULL`,
    [flowId, userId],
  );
  return result.affectedRows > 0;
}

// ── saveFlowCanvas ────────────────────────────────────────────────────────────

/**
 * Saves a new canvas document to a flow with an optimistic-version guard (ADR-0003).
 *
 * The UPDATE atomically increments `version` only when the DB row still has
 * `version = parentVersion` AND `user_id = userId` AND `deleted_at IS NULL`.
 *
 * Returns:
 *  - `{ saved: true, flow }` — the updated row (version incremented).
 *  - `{ saved: false, flow: null }` — version mismatch or no matching row
 *    (stale client, wrong owner, or soft-deleted). The service layer maps this
 *    to `OptimisticLockError` (409).
 *
 * Does NOT throw on conflict — that is the service's responsibility (AC-10b).
 */
export async function saveFlowCanvas(params: SaveFlowCanvasParams): Promise<SaveFlowCanvasResult> {
  const { flowId, userId, canvas, parentVersion } = params;

  const [result] = await pool.execute<ResultSetHeader>(
    `UPDATE generation_flows
        SET canvas = ?, version = version + 1, updated_at = NOW(3)
      WHERE flow_id = ? AND user_id = ? AND version = ? AND deleted_at IS NULL`,
    [JSON.stringify(canvas), flowId, userId, parentVersion],
  );

  if (result.affectedRows === 0) {
    return { saved: false, flow: null };
  }

  const flow = await readFlowByPk(flowId);
  if (!flow) {
    // Should not happen — the UPDATE succeeded but the row is gone; defensive guard.
    return { saved: false, flow: null };
  }
  return { saved: true, flow };
}
