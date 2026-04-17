import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise';

import { pool } from '@/db/connection.js';
import type { PromptDoc } from '@ai-video-editor/project-schema';

/** A generation draft row as returned from the database. */
export type GenerationDraft = {
  id: string;
  userId: string;
  promptDoc: PromptDoc;
  createdAt: Date;
  updatedAt: Date;
};

type GenerationDraftRow = RowDataPacket & {
  id: string;
  user_id: string;
  /**
   * mysql2/promise returns MySQL JSON columns as already-parsed objects when
   * the underlying MySQL driver performs automatic JSON parsing. Accept both
   * string (e.g. test doubles or older driver behaviour) and object.
   */
  prompt_doc: string | PromptDoc;
  created_at: Date;
  updated_at: Date;
};

function mapRowToDraft(row: GenerationDraftRow): GenerationDraft {
  return {
    id: row.id,
    userId: row.user_id,
    promptDoc:
      typeof row.prompt_doc === 'string'
        ? (JSON.parse(row.prompt_doc) as PromptDoc)
        : (row.prompt_doc as PromptDoc),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Insert a new generation draft row and return it. */
export async function insertDraft(
  id: string,
  userId: string,
  promptDoc: PromptDoc,
): Promise<GenerationDraft> {
  const now = new Date();
  await pool.query<ResultSetHeader>(
    `INSERT INTO generation_drafts (id, user_id, prompt_doc, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
    [id, userId, JSON.stringify(promptDoc), now, now],
  );

  const [rows] = await pool.query<GenerationDraftRow[]>(
    `SELECT id, user_id, prompt_doc, created_at, updated_at
     FROM generation_drafts WHERE id = ?`,
    [id],
  );
  return mapRowToDraft(rows[0]!);
}

/**
 * Fetch a single draft by id (no owner filter).
 *
 * Ownership strategy: this function returns the full row regardless of owner.
 * The service uses a two-step check — first call findDraftById to detect 404,
 * then compare draft.userId to enforce 403 — so that the correct HTTP status
 * code is returned (404 when row is absent, 403 when owned by another user).
 */
export async function findDraftById(id: string): Promise<GenerationDraft | null> {
  const [rows] = await pool.query<GenerationDraftRow[]>(
    `SELECT id, user_id, prompt_doc, created_at, updated_at
     FROM generation_drafts WHERE id = ?`,
    [id],
  );
  if (!rows.length) return null;
  return mapRowToDraft(rows[0]!);
}

/** List all drafts belonging to a user, newest first. */
export async function findDraftsByUserId(userId: string): Promise<GenerationDraft[]> {
  const [rows] = await pool.query<GenerationDraftRow[]>(
    `SELECT id, user_id, prompt_doc, created_at, updated_at
     FROM generation_drafts WHERE user_id = ?
     ORDER BY updated_at DESC, id DESC`,
    [userId],
  );
  return rows.map(mapRowToDraft);
}

/**
 * Update the prompt_doc of an existing draft.
 * Filters on both id AND user_id — returns the updated row or null when no
 * row matched (either missing or wrong owner).
 */
export async function updateDraftPromptDoc(
  id: string,
  userId: string,
  promptDoc: PromptDoc,
): Promise<GenerationDraft | null> {
  const now = new Date();
  const [result] = await pool.query<ResultSetHeader>(
    `UPDATE generation_drafts SET prompt_doc = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`,
    [JSON.stringify(promptDoc), now, id, userId],
  );
  if (result.affectedRows === 0) return null;

  const [rows] = await pool.query<GenerationDraftRow[]>(
    `SELECT id, user_id, prompt_doc, created_at, updated_at
     FROM generation_drafts WHERE id = ?`,
    [id],
  );
  return rows.length ? mapRowToDraft(rows[0]!) : null;
}

/**
 * Delete a draft.
 * Filters on both id AND user_id — returns true when a row was deleted,
 * false when no row matched.
 */
export async function deleteDraft(id: string, userId: string): Promise<boolean> {
  const [result] = await pool.query<ResultSetHeader>(
    `DELETE FROM generation_drafts WHERE id = ? AND user_id = ?`,
    [id, userId],
  );
  return result.affectedRows > 0;
}
