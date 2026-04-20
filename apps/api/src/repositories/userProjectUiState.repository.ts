/**
 * Repository for the user_project_ui_state table.
 *
 * Each row stores an opaque JSON blob of ephemeral timeline UI state (zoom,
 * scroll, playhead, selection) keyed on (user_id, project_id). The shape of
 * state_json belongs entirely to the frontend — the repository treats it as
 * `unknown` and makes no assumptions about its structure.
 *
 * All three public functions are the sole DB surface for this table: no other
 * file in the codebase should query user_project_ui_state directly.
 */

import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise';

import { pool } from '@/db/connection.js';

/** A hydrated row from user_project_ui_state. */
export type UserProjectUiState = {
  userId: string;
  projectId: string;
  /** Opaque UI state blob — shape is owned by the web-editor. */
  state: unknown;
  updatedAt: Date;
};

type UserProjectUiStateRow = RowDataPacket & {
  user_id: string;
  project_id: string;
  /** mysql2 returns JSON columns as already-parsed objects; accept both forms. */
  state_json: unknown;
  updated_at: Date;
};

function mapRow(row: UserProjectUiStateRow): UserProjectUiState {
  return {
    userId: row.user_id,
    projectId: row.project_id,
    // mysql2 parses JSON columns automatically; no string branch needed here,
    // but the type is `unknown` in both cases so we forward it directly.
    state: row.state_json,
    updatedAt: row.updated_at,
  };
}

/**
 * Returns the UI state row for the given (userId, projectId) pair, or null
 * when no row exists yet.
 */
export async function getByUserAndProject(
  userId: string,
  projectId: string,
): Promise<UserProjectUiState | null> {
  const [rows] = await pool.query<UserProjectUiStateRow[]>(
    `SELECT user_id, project_id, state_json, updated_at
       FROM user_project_ui_state
      WHERE user_id = ? AND project_id = ?`,
    [userId, projectId],
  );
  if (!rows.length) return null;
  return mapRow(rows[0]!);
}

/**
 * Inserts or replaces the UI state for the given (userId, projectId) pair.
 *
 * Uses INSERT … ON DUPLICATE KEY UPDATE so the call is idempotent: a missing
 * row is created, an existing row is overwritten. updated_at is refreshed
 * automatically by the ON UPDATE CURRENT_TIMESTAMP(3) column default.
 *
 * Returns the persisted row (re-read after the upsert to capture updated_at).
 */
export async function upsertByUserAndProject(
  userId: string,
  projectId: string,
  state: unknown,
): Promise<UserProjectUiState> {
  const stateJson = JSON.stringify(state);

  await pool.query<ResultSetHeader>(
    `INSERT INTO user_project_ui_state (user_id, project_id, state_json)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE state_json = VALUES(state_json)`,
    [userId, projectId, stateJson],
  );

  // Re-read to get the server-generated updated_at timestamp.
  const [rows] = await pool.query<UserProjectUiStateRow[]>(
    `SELECT user_id, project_id, state_json, updated_at
       FROM user_project_ui_state
      WHERE user_id = ? AND project_id = ?`,
    [userId, projectId],
  );

  // The INSERT … ON DUPLICATE KEY UPDATE is atomic, so a row must exist now.
  return mapRow(rows[0]!);
}

/**
 * Deletes the UI state row for the given (userId, projectId) pair.
 *
 * Returns true when a row was deleted, false when no row matched (already
 * absent — the call is treated as a no-op).
 */
export async function deleteByUserAndProject(
  userId: string,
  projectId: string,
): Promise<boolean> {
  const [result] = await pool.query<ResultSetHeader>(
    `DELETE FROM user_project_ui_state
      WHERE user_id = ? AND project_id = ?`,
    [userId, projectId],
  );
  return result.affectedRows > 0;
}
