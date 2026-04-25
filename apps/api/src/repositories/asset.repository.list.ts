/**
 * Paginated list helpers for the asset repository — extracted to keep
 * `asset.repository.ts` under the §9.7 300-line cap.
 *
 * Exports: `AssetMimePrefix`, `AssetTotalsRow`, `findReadyForUser`,
 *          `getReadyTotalsForUser`.
 *
 * All functions read from the `files` table directly (user-scoped, no project
 * join). `AssetRow` and `mapRowToAsset` are duplicated here rather than
 * imported from the main module to avoid a runtime circular-import — the main
 * module re-exports these functions via `export { ... } from` which would
 * create an ESM cycle at runtime if this file also imported values from it.
 * `import type` (type-only) is safe and used for the `Asset`/`AssetStatus`
 * return-type annotations because TypeScript erases those before emit.
 */
import type { RowDataPacket } from 'mysql2/promise';

import { pool } from '@/db/connection.js';

import type { Asset, AssetStatus } from './asset.repository.js';

// ── Internal row type (mirrors the one in asset.repository.ts) ────────────────
// Duplicated here to avoid a runtime circular dependency. Keep in sync with
// the canonical AssetRow in asset.repository.ts when that type changes.
type AssetRow = RowDataPacket & {
  file_id: string;
  project_id: string | null;
  user_id: string;
  display_name: string | null;
  mime_type: string | null;
  bytes: string | number | null;
  storage_uri: string;
  status: AssetStatus;
  error_message: string | null;
  duration_ms: number | null;
  width: number | null;
  height: number | null;
  created_at: Date;
  updated_at: Date;
};

/** Maps an `AssetRow` to the legacy `Asset` shape. See `asset.repository.ts` for field notes. */
function mapRowToAsset(row: AssetRow): Asset {
  return {
    fileId: row.file_id,
    projectId: row.project_id ?? '',
    userId: row.user_id,
    filename: row.display_name ?? row.file_id,
    displayName: row.display_name,
    contentType: row.mime_type ?? '',
    fileSizeBytes: row.bytes == null ? 0 : Number(row.bytes),
    storageUri: row.storage_uri,
    status: row.status,
    errorMessage: row.error_message,
    durationFrames: row.duration_ms == null ? null : Math.round(row.duration_ms / 1000 * 30),
    width: row.width,
    height: row.height,
    fps: null,
    thumbnailUri: null,
    waveformJson: null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Filter applied to the global list query. A raw MIME prefix — the service maps enum buckets to this. */
export type AssetMimePrefix = 'video/' | 'image/' | 'audio/';

type FindReadyParams = {
  userId: string;
  /** Optional MIME prefix filter. Omit to return all three buckets. */
  mimePrefix?: AssetMimePrefix;
  /** Seek cursor: only return rows strictly older than `(updatedAt, fileId)`. */
  cursor?: { updatedAt: Date; fileId: string };
  /** Maximum rows to return. Clamped by the caller (1–100). */
  limit: number;
};

/**
 * Returns the authenticated user's `ready` files, ordered newest first and
 * filtered by MIME prefix + seek cursor. Stable under concurrent inserts
 * because the cursor tiebreaks by `file_id`.
 *
 * User-scoped (reads from `files` directly — no project join needed).
 * The `content_type` filter from the old query maps to `mime_type LIKE ?` here.
 *
 * LIMIT is interpolated after a Number() coercion — safe because callers must
 * pass a pre-validated integer, and mysql2 prepared statements do not bind
 * LIMIT reliably across driver versions.
 */
export async function findReadyForUser(params: FindReadyParams): Promise<Asset[]> {
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
  // No project join needed — findReadyForUser is user-scoped, not project-scoped.
  // projectId will be empty string for rows without a project_files link.
  const sql =
    `SELECT *, NULL AS project_id FROM files
     WHERE ${clauses.join(' AND ')}
     ORDER BY updated_at DESC, file_id DESC
     LIMIT ${safeLimit}`;

  const [rows] = await pool.query<AssetRow[]>(sql, values);
  return rows.map(mapRowToAsset);
}

/** Single-bucket totals row returned by `getReadyTotalsForUser`. */
export type AssetTotalsRow = {
  mimePrefix: AssetMimePrefix;
  count: number;
  bytes: number;
};

type TotalsRow = RowDataPacket & {
  mime_prefix: AssetMimePrefix;
  count: number;
  bytes: string | number | null;
};

/**
 * Aggregates the user's `ready` files by MIME bucket. Returns one row per
 * bucket that has at least one file. Callers fill in zero for missing buckets.
 *
 * User-scoped (reads from `files` directly — no project join needed).
 *
 * Note: `SUM(BIGINT)` returns a decimal string in mysql2 — we Number()-coerce
 * in the mapper to keep the repository type contract numeric.
 */
export async function getReadyTotalsForUser(userId: string): Promise<AssetTotalsRow[]> {
  const [rows] = await pool.query<TotalsRow[]>(
    `SELECT
       CASE
         WHEN mime_type LIKE 'video/%' THEN 'video/'
         WHEN mime_type LIKE 'image/%' THEN 'image/'
         WHEN mime_type LIKE 'audio/%' THEN 'audio/'
         ELSE NULL
       END AS mime_prefix,
       COUNT(*) AS count,
       SUM(bytes) AS bytes
     FROM files
     WHERE user_id = ? AND status = 'ready' AND deleted_at IS NULL
     GROUP BY mime_prefix`,
    [userId],
  );

  return rows
    .filter((r): r is TotalsRow & { mime_prefix: AssetMimePrefix } => r.mime_prefix !== null)
    .map((r) => ({
      mimePrefix: r.mime_prefix,
      count: Number(r.count),
      bytes: r.bytes == null ? 0 : Number(r.bytes),
    }));
}
