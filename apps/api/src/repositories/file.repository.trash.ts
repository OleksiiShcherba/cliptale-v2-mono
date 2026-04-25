/**
 * Trash-list query for `file.repository` — split out to keep file.repository.ts
 * under the 300-line limit (architecture-rules.md §9.7).
 *
 * Exports `listSoftDeletedByUser` — the only function needed by trash.service.ts.
 */
import type { RowDataPacket } from 'mysql2/promise';

import { pool } from '@/db/connection.js';

/** Lightweight trash-list entry for a soft-deleted file. */
export type SoftDeletedFileRow = {
  fileId: string;
  displayName: string | null;
  deletedAt: Date;
};

type SoftDeletedDbRow = RowDataPacket & {
  file_id: string;
  display_name: string | null;
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
 * Returns the user's soft-deleted files, newest-deleted-first.
 * When `cursor` is provided, returns only items older than the cursor position.
 * `limit` is capped at 100 to guard against accidental large fetches.
 */
export async function listSoftDeletedByUser(
  userId: string,
  limit: number,
  cursor?: string,
): Promise<SoftDeletedFileRow[]> {
  const safeLimit = Math.max(1, Math.min(100, Math.floor(Number(limit))));
  const parsed = parseCursor(cursor);

  let rows: SoftDeletedDbRow[];

  if (parsed) {
    const [result] = await pool.query<SoftDeletedDbRow[]>(
      `SELECT file_id, display_name, deleted_at
       FROM files
       WHERE user_id = ? AND deleted_at IS NOT NULL
         AND (deleted_at < ? OR (deleted_at = ? AND file_id < ?))
       ORDER BY deleted_at DESC, file_id DESC
       LIMIT ${safeLimit}`,
      [userId, parsed.deletedAt, parsed.deletedAt, parsed.id],
    );
    rows = result;
  } else {
    const [result] = await pool.query<SoftDeletedDbRow[]>(
      `SELECT file_id, display_name, deleted_at
       FROM files
       WHERE user_id = ? AND deleted_at IS NOT NULL
       ORDER BY deleted_at DESC, file_id DESC
       LIMIT ${safeLimit}`,
      [userId],
    );
    rows = result;
  }

  return rows.map((row) => ({
    fileId: row.file_id,
    displayName: row.display_name,
    deletedAt: row.deleted_at,
  }));
}
