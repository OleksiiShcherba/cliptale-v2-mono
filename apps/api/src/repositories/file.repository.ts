import type { RowDataPacket } from 'mysql2/promise';

import type { FileKind } from '@ai-video-editor/project-schema';

import { pool } from '@/db/connection.js';

// Re-export so existing imports of FileKind from this module continue to work.
export type { FileKind };

/**
 * Lifecycle status for a file row.
 * `pending`   → presigned URL issued, upload not yet confirmed.
 * `processing` → finalize called, ingest job running.
 * `ready`     → ingest complete, metadata populated.
 * `error`     → ingest failed.
 */
export type FileStatus = 'pending' | 'processing' | 'ready' | 'error';

/** Full `files` row as returned by the repository. */
export type FileRow = {
  fileId: string;
  userId: string;
  kind: FileKind;
  storageUri: string;
  mimeType: string | null;
  bytes: number | null;
  width: number | null;
  height: number | null;
  /** Duration in milliseconds (for video/audio). Null for images/documents. */
  durationMs: number | null;
  displayName: string | null;
  status: FileStatus;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/** Parameters for inserting a new `pending` file row. */
type CreatePendingParams = {
  fileId: string;
  userId: string;
  kind: FileKind;
  storageUri: string;
  mimeType: string;
  displayName: string;
};

/** Parameters for finalizing a file (status → processing). */
type FinalizeParams = {
  fileId: string;
  mimeType: string;
};

/** Parameters written back by the ingest worker after FFprobe completes. */
export type ProbeMetadataParams = {
  fileId: string;
  durationMs: number | null;
  width: number | null;
  height: number | null;
  bytes: number | null;
};

/** Filter applied to the paginated list query. */
export type FileMimePrefix = 'video/' | 'image/' | 'audio/';

type FindReadyParams = {
  userId: string;
  mimePrefix?: FileMimePrefix;
  cursor?: { updatedAt: Date; fileId: string };
  limit: number;
};

// ── Internal row type ─────────────────────────────────────────────────────────

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
  };
}

// ── Write operations ──────────────────────────────────────────────────────────

/** Inserts a `pending` file row. Called immediately after the presigned URL is issued. */
export async function createPending(params: CreatePendingParams): Promise<void> {
  await pool.execute(
    `INSERT INTO files
       (file_id, user_id, kind, storage_uri, mime_type, display_name)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      params.fileId,
      params.userId,
      params.kind,
      params.storageUri,
      params.mimeType,
      params.displayName,
    ],
  );
}

/**
 * Transitions a file from `pending` → `processing` and sets the resolved mime_type.
 * Silent no-op when `file_id` does not match (the service checks existence first).
 */
export async function finalize(params: FinalizeParams): Promise<void> {
  await pool.execute(
    `UPDATE files SET status = 'processing', mime_type = ? WHERE file_id = ?`,
    [params.mimeType, params.fileId],
  );
}

/**
 * Writes FFprobe metadata back to the file row and marks it `ready`.
 * Called by the ingest worker after probing completes.
 */
export async function updateProbeMetadata(params: ProbeMetadataParams): Promise<void> {
  await pool.execute(
    `UPDATE files
     SET status = 'ready',
         duration_ms = ?,
         width = ?,
         height = ?,
         bytes = ?,
         error_message = NULL
     WHERE file_id = ?`,
    [params.durationMs, params.width, params.height, params.bytes, params.fileId],
  );
}

/** Sets the file status to `error` with a message. Called by the ingest worker on failure. */
export async function setFileError(fileId: string, message: string): Promise<void> {
  await pool.execute(
    `UPDATE files SET status = 'error', error_message = ? WHERE file_id = ?`,
    [message, fileId],
  );
}

// ── Read operations ───────────────────────────────────────────────────────────

/** Returns a single file row by its primary key, or null when not found. */
export async function findById(fileId: string): Promise<FileRow | null> {
  const [rows] = await pool.execute<DbRow[]>(
    'SELECT * FROM files WHERE file_id = ?',
    [fileId],
  );
  return rows.length ? mapRow(rows[0]!) : null;
}

/** Returns a file only if it exists AND belongs to `userId`. Null otherwise. */
export async function findByIdForUser(fileId: string, userId: string): Promise<FileRow | null> {
  const [rows] = await pool.execute<DbRow[]>(
    'SELECT * FROM files WHERE file_id = ? AND user_id = ?',
    [fileId, userId],
  );
  return rows.length ? mapRow(rows[0]!) : null;
}

/**
 * Returns the authenticated user's `ready` files, newest-first, cursor-paginated.
 * Stable under concurrent inserts because the cursor tiebreaks by `file_id`.
 *
 * LIMIT is interpolated (not bound) after a Number() coercion — safe because
 * callers must pass a pre-validated integer; mysql2 does not bind LIMIT reliably.
 */
export async function findReadyForUser(params: FindReadyParams): Promise<FileRow[]> {
  const clauses: string[] = ['status = ?', 'user_id = ?'];
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
     WHERE user_id = ? AND status = 'ready'
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
