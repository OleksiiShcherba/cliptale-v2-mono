import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise';

import { pool } from '@/db/connection.js';
import type { PromptDoc } from '@ai-video-editor/project-schema';

/** Valid status values for a generation draft. */
export type GenerationDraftStatus = 'draft' | 'step2' | 'step3' | 'completed';

/** A generation draft row as returned from the database. */
export type GenerationDraft = {
  id: string;
  userId: string;
  promptDoc: PromptDoc;
  status: GenerationDraftStatus;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

/**
 * A single media-preview entry for the storyboard card — resolved from
 * `files` via the fileId in a MediaRefBlock.
 */
export type MediaPreview = {
  fileId: string;
  type: 'video' | 'image' | 'audio';
  thumbnailUrl: string | null;
};

/** Storyboard card summary returned by findStoryboardCardsForUser. */
export type StoryboardCard = {
  draftId: string;
  status: GenerationDraftStatus;
  textPreview: string;
  mediaPreviews: MediaPreview[];
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
  status: GenerationDraftStatus;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

function mapRowToDraft(row: GenerationDraftRow): GenerationDraft {
  return {
    id: row.id,
    userId: row.user_id,
    promptDoc:
      typeof row.prompt_doc === 'string'
        ? (JSON.parse(row.prompt_doc) as PromptDoc)
        : (row.prompt_doc as PromptDoc),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? null,
  };
}

type StoryboardCardRow = RowDataPacket & {
  id: string;
  status: GenerationDraftStatus;
  prompt_doc: string | PromptDoc;
  updated_at: Date;
};

type AssetPreviewRow = RowDataPacket & {
  file_id: string;
  mime_type: string;
  // thumbnail_uri does not exist on the `files` table yet — backfill is a later milestone.
};

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
    `SELECT id, user_id, prompt_doc, status, created_at, updated_at, deleted_at
     FROM generation_drafts WHERE id = ?`,
    [id],
  );
  return mapRowToDraft(rows[0]!);
}

/**
 * Fetch a single non-deleted draft by id (no owner filter).
 *
 * Ownership strategy: this function returns the full row regardless of owner.
 * The service uses a two-step check — first call findDraftById to detect 404,
 * then compare draft.userId to enforce 403 — so that the correct HTTP status
 * code is returned (404 when row is absent, 403 when owned by another user).
 */
export async function findDraftById(id: string): Promise<GenerationDraft | null> {
  const [rows] = await pool.query<GenerationDraftRow[]>(
    `SELECT id, user_id, prompt_doc, status, created_at, updated_at, deleted_at
     FROM generation_drafts WHERE id = ? AND deleted_at IS NULL`,
    [id],
  );
  if (!rows.length) return null;
  return mapRowToDraft(rows[0]!);
}

/**
 * Returns a draft row regardless of soft-delete state.
 * Intended only for internal restore/admin paths — not re-exported from barrels.
 */
export async function findDraftByIdIncludingDeleted(id: string): Promise<GenerationDraft | null> {
  const [rows] = await pool.query<GenerationDraftRow[]>(
    `SELECT id, user_id, prompt_doc, status, created_at, updated_at, deleted_at
     FROM generation_drafts WHERE id = ?`,
    [id],
  );
  if (!rows.length) return null;
  return mapRowToDraft(rows[0]!);
}

/** List all non-deleted drafts belonging to a user, newest first. */
export async function findDraftsByUserId(userId: string): Promise<GenerationDraft[]> {
  const [rows] = await pool.query<GenerationDraftRow[]>(
    `SELECT id, user_id, prompt_doc, status, created_at, updated_at, deleted_at
     FROM generation_drafts WHERE user_id = ? AND deleted_at IS NULL
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
    `SELECT id, user_id, prompt_doc, status, created_at, updated_at, deleted_at
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

/**
 * Updates the status of a draft.
 * Silently ignores zero-affected-row results — the caller (service) is
 * responsible for asserting ownership before calling this function.
 */
export async function updateDraftStatus(
  draftId: string,
  status: GenerationDraftStatus,
): Promise<void> {
  await pool.query<ResultSetHeader>(
    'UPDATE generation_drafts SET status = ?, updated_at = NOW() WHERE id = ?',
    [status, draftId],
  );
}

/**
 * Soft-deletes a draft by setting `deleted_at` to the current timestamp.
 * Returns true when a row was updated, false when `id` was not found or was
 * already soft-deleted.
 */
export async function softDeleteDraft(id: string): Promise<boolean> {
  const [result] = await pool.query<ResultSetHeader>(
    'UPDATE generation_drafts SET deleted_at = NOW(3) WHERE id = ? AND deleted_at IS NULL',
    [id],
  );
  return result.affectedRows > 0;
}

/**
 * Restores a soft-deleted draft by clearing `deleted_at`.
 * Returns true when a row was updated, false when `id` was not found or was
 * not soft-deleted.
 */
export async function restoreDraft(id: string): Promise<boolean> {
  const [result] = await pool.query<ResultSetHeader>(
    'UPDATE generation_drafts SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL',
    [id],
  );
  return result.affectedRows > 0;
}

// ---------------------------------------------------------------------------
// Storyboard cards — powers GET /generation-drafts/cards
// ---------------------------------------------------------------------------

/**
 * Returns lightweight draft rows for the storyboard card list.
 * Only the columns needed for card assembly are fetched; prompt_doc parsing
 * and asset resolution are handled by the service layer.
 * Ownership is enforced at the SQL level via user_id = ?.
 */
export async function findStoryboardDraftsForUser(userId: string): Promise<
  Array<{
    id: string;
    status: GenerationDraftStatus;
    promptDoc: PromptDoc;
    updatedAt: Date;
  }>
> {
  const [rows] = await pool.query<StoryboardCardRow[]>(
    `SELECT id, status, prompt_doc, updated_at
     FROM generation_drafts
     WHERE user_id = ? AND deleted_at IS NULL
     ORDER BY updated_at DESC, id DESC`,
    [userId],
  );

  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    promptDoc:
      typeof row.prompt_doc === 'string'
        ? (JSON.parse(row.prompt_doc) as PromptDoc)
        : (row.prompt_doc as PromptDoc),
    updatedAt: row.updated_at,
  }));
}

/**
 * Batch-fetches asset preview data (fileId, contentType, thumbnailUri) for a
 * set of file IDs. Returns only rows that exist in `files` — missing IDs are
 * silently absent from the result (caller handles the skip).
 *
 * Accepts an empty array gracefully by returning [] without issuing a query.
 *
 * thumbnailUri is always null: the `files` table has no thumbnail_uri column.
 * Thumbnail backfill is a later milestone (Files-as-Root phase 2).
 */
export async function findAssetPreviewsByIds(
  fileIds: string[],
): Promise<Array<{ fileId: string; contentType: string; thumbnailUri: string | null }>> {
  if (fileIds.length === 0) return [];

  const placeholders = fileIds.map(() => '?').join(', ');
  const [rows] = await pool.query<AssetPreviewRow[]>(
    `SELECT file_id, mime_type
     FROM files
     WHERE file_id IN (${placeholders}) AND deleted_at IS NULL`,
    fileIds,
  );

  return rows.map((row) => ({
    fileId: row.file_id,
    contentType: row.mime_type,
    // thumbnailUri: null — `files` has no thumbnail_uri column yet (backfill pending).
    thumbnailUri: null,
  }));
}
