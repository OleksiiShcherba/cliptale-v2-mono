/**
 * Trash-list query for `generationDraft.repository` — split to keep
 * generationDraft.repository.ts under the 300-line limit (§9.7).
 *
 * Exports `listSoftDeletedByUser` used by trash.service.ts.
 */
import type { RowDataPacket } from 'mysql2/promise';

import { pool } from '@/db/connection.js';

/** Lightweight trash-list entry for a soft-deleted generation draft. */
export type SoftDeletedDraftRow = {
  id: string;
  textPreview: string;
  deletedAt: Date;
};

type SoftDeletedDraftDbRow = RowDataPacket & {
  id: string;
  prompt_doc: string | Record<string, unknown>;
  deleted_at: Date;
};

/**
 * Parses a keyset cursor string produced by `listSoftDeletedByUser`.
 * Format: `<ISO8601-deleted-at>:<id>`
 * Returns null when the string is absent or malformed.
 */
function parseCursor(cursor: string | undefined): { deletedAt: Date; id: string } | null {
  if (!cursor) return null;
  const colonIdx = cursor.indexOf(':');
  if (colonIdx === -1) return null;
  const ts = cursor.slice(0, colonIdx);
  const id = cursor.slice(colonIdx + 1);
  const date = new Date(ts);
  if (isNaN(date.getTime()) || !id) return null;
  return { deletedAt: date, id };
}

/**
 * Returns the user's soft-deleted generation drafts, newest-deleted-first.
 * When `cursor` is provided, returns only items older than the cursor position.
 * `limit` is capped at 100.
 */
export async function listSoftDeletedByUser(
  userId: string,
  limit: number,
  cursor?: string,
): Promise<SoftDeletedDraftRow[]> {
  const safeLimit = Math.max(1, Math.min(100, Math.floor(Number(limit))));
  const parsed = parseCursor(cursor);

  let rows: SoftDeletedDraftDbRow[];

  if (parsed) {
    const [result] = await pool.query<SoftDeletedDraftDbRow[]>(
      `SELECT id, prompt_doc, deleted_at
       FROM generation_drafts
       WHERE user_id = ? AND deleted_at IS NOT NULL
         AND (deleted_at < ? OR (deleted_at = ? AND id < ?))
       ORDER BY deleted_at DESC, id DESC
       LIMIT ${safeLimit}`,
      [userId, parsed.deletedAt, parsed.deletedAt, parsed.id],
    );
    rows = result;
  } else {
    const [result] = await pool.query<SoftDeletedDraftDbRow[]>(
      `SELECT id, prompt_doc, deleted_at
       FROM generation_drafts
       WHERE user_id = ? AND deleted_at IS NOT NULL
       ORDER BY deleted_at DESC, id DESC
       LIMIT ${safeLimit}`,
      [userId],
    );
    rows = result;
  }

  return rows.map((row) => {
    const doc =
      typeof row.prompt_doc === 'string'
        ? (JSON.parse(row.prompt_doc) as Record<string, unknown>)
        : (row.prompt_doc as Record<string, unknown>);
    // Extract a short text preview from the first text block in the promptDoc.
    const blocks = Array.isArray(doc['blocks']) ? (doc['blocks'] as unknown[]) : [];
    const firstText = blocks.find(
      (b): b is Record<string, unknown> =>
        typeof b === 'object' && b !== null && (b as Record<string, unknown>)['type'] === 'text',
    );
    const textPreview =
      typeof firstText?.['content'] === 'string'
        ? firstText['content'].slice(0, 120)
        : 'Draft';
    return { id: row.id, textPreview, deletedAt: row.deleted_at };
  });
}
