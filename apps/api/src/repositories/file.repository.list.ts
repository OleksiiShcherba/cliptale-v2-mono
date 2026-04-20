/**
 * Paginated list helpers for the file repository — extracted to keep
 * `file.repository.ts` under the §9.7 300-line cap.
 *
 * Exports: `FileMimePrefix`, `FileTotalsRow`, `findReadyForUser`,
 *          `getReadyTotalsForUser`.
 *
 * The internal `DbRow` type is duplicated here (rather than imported from the
 * main module) to avoid a runtime circular dependency. Keep in sync with the
 * canonical DbRow in `file.repository.ts` when that type changes.
 */

import type { RowDataPacket } from 'mysql2/promise';

import { pool } from '@/db/connection.js';

import type { FileRow, FileStatus } from './file.repository.js';
import type { FileKind } from '@ai-video-editor/project-schema';

// ── Internal row type (mirrors DbRow in file.repository.ts) ──────────────────

type DbRow = RowDataPacket & {
  file_id: string;
  user_id: string;
  kind: FileKind;
  storage_uri: string;
  mime_type: string | null;
  bytes: string | number | null;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  display_name: string | null;
  status: FileStatus;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  thumbnail_uri: string | null;
};

function mapRow(row: DbRow): FileRow {
  return {
    fileId: row.file_id,
    userId: row.user_id,
    kind: row.kind,
    storageUri: row.storage_uri,
    mimeType: row.mime_type,
    bytes: row.bytes == null ? null : Number(row.bytes),
    width: row.width,
    height: row.height,
    durationMs: row.duration_ms,
    displayName: row.display_name,
    status: row.status,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? null,
    thumbnailUri: row.thumbnail_uri ?? null,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Filter applied to the paginated list query. */
export type FileMimePrefix = 'video/' | 'image/' | 'audio/';

type FindReadyParams = {
  userId: string;
  mimePrefix?: FileMimePrefix;
  cursor?: { updatedAt: Date; fileId: string };
  limit: number;
};

/**
 * Returns the authenticated user's `ready` files, newest-first, cursor-paginated.
 * LIMIT is interpolated after Number() coercion — mysql2 does not bind LIMIT reliably.
 */
export async function findReadyForUser(params: FindReadyParams): Promise<FileRow[]> {
  const clauses: string[] = ['status = ?', 'user_id = ?', 'deleted_at IS NULL'];
  const values: unknown[] = ['ready', params.userId];

  if (params.mimePrefix) {
    clauses.push('mime_type LIKE ?');
    values.push(`${params.mimePrefix}%`);
  }

  if (params.cursor) {
    clauses.push('(updated_at, file_id) < (?, ?)');
    values.push(params.cursor.updatedAt, params.cursor.fileId);
  }

  const safeLimit = Math.max(1, Math.min(100, Math.floor(Number(params.limit))));
  const sql =
    `SELECT * FROM files
     WHERE ${clauses.join(' AND ')}
     ORDER BY updated_at DESC, file_id DESC
     LIMIT ${safeLimit}`;

  const [rows] = await pool.query<DbRow[]>(sql, values);
  return rows.map(mapRow);
}

/** Aggregated totals row returned by `getReadyTotalsForUser`. */
export type FileTotalsRow = {
  mimePrefix: FileMimePrefix;
  count: number;
  bytes: number;
};

type TotalsDbRow = RowDataPacket & {
  mime_prefix: FileMimePrefix;
  count: number;
  bytes: string | number | null;
};

/**
 * Returns ALL non-deleted files owned by `userId`, ordered newest-first.
 * No status filter — includes pending, processing, ready, and error files.
 * Used by the `scope=all` path on the asset-list endpoints.
 */
export async function findAllForUser(userId: string): Promise<FileRow[]> {
  const [rows] = await pool.query<DbRow[]>(
    `SELECT * FROM files
     WHERE user_id = ? AND deleted_at IS NULL
     ORDER BY created_at DESC, file_id DESC`,
    [userId],
  );
  return rows.map(mapRow);
}

/**
 * Aggregates the user's `ready` files by MIME bucket.
 * Returns one row per bucket that has at least one file.
 */
export async function getReadyTotalsForUser(userId: string): Promise<FileTotalsRow[]> {
  const [rows] = await pool.query<TotalsDbRow[]>(
    `SELECT
       CASE
         WHEN mime_type LIKE 'video/%' THEN 'video/'
         WHEN mime_type LIKE 'image/%' THEN 'image/'
         WHEN mime_type LIKE 'audio/%' THEN 'audio/'
         ELSE NULL
       END AS mime_prefix,
       COUNT(*)          AS count,
       SUM(bytes)        AS bytes
     FROM files
     WHERE user_id = ? AND status = 'ready' AND deleted_at IS NULL
     GROUP BY mime_prefix`,
    [userId],
  );

  return rows
    .filter((r): r is TotalsDbRow & { mime_prefix: FileMimePrefix } => r.mime_prefix !== null)
    .map((r) => ({
      mimePrefix: r.mime_prefix,
      count: Number(r.count),
      bytes: r.bytes == null ? 0 : Number(r.bytes),
    }));
}
