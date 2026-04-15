import type { RowDataPacket } from 'mysql2/promise';

import { pool } from '@/db/connection.js';

/**
 * Lifecycle status of an asset in the ingest pipeline.
 * `pending` → uploaded but not yet finalized; `processing` → ingest job running;
 * `ready` → metadata/thumbnail extracted; `error` → ingest failed.
 */
export type AssetStatus = 'pending' | 'processing' | 'ready' | 'error';

/** Full asset record as stored in `project_assets_current`. */
export type Asset = {
  assetId: string;
  projectId: string;
  userId: string;
  filename: string;
  displayName: string | null;
  contentType: string;
  fileSizeBytes: number;
  storageUri: string;
  status: AssetStatus;
  errorMessage: string | null;
  durationFrames: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  thumbnailUri: string | null;
  waveformJson: unknown | null;
  createdAt: Date;
  updatedAt: Date;
};

/** Parameters for inserting a new pending asset row. */
type InsertPendingAssetParams = {
  assetId: string;
  projectId: string;
  userId: string;
  filename: string;
  contentType: string;
  fileSizeBytes: number;
  storageUri: string;
};

type AssetRow = RowDataPacket & {
  asset_id: string;
  project_id: string;
  user_id: string;
  filename: string;
  display_name: string | null;
  content_type: string;
  file_size_bytes: number;
  storage_uri: string;
  status: AssetStatus;
  error_message: string | null;
  duration_frames: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  thumbnail_uri: string | null;
  waveform_json: unknown | null;
  created_at: Date;
  updated_at: Date;
};

function mapRowToAsset(row: AssetRow): Asset {
  return {
    assetId: row.asset_id,
    projectId: row.project_id,
    userId: row.user_id,
    filename: row.filename,
    displayName: row.display_name,
    contentType: row.content_type,
    fileSizeBytes: row.file_size_bytes,
    storageUri: row.storage_uri,
    status: row.status,
    errorMessage: row.error_message,
    durationFrames: row.duration_frames,
    width: row.width,
    height: row.height,
    fps: row.fps,
    thumbnailUri: row.thumbnail_uri,
    waveformJson: row.waveform_json,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Inserts a new asset row with status='pending'. Called immediately after issuing the presigned URL. */
export async function insertPendingAsset(params: InsertPendingAssetParams): Promise<void> {
  await pool.execute(
    `INSERT INTO project_assets_current
       (asset_id, project_id, user_id, filename, content_type, file_size_bytes, storage_uri)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      params.assetId,
      params.projectId,
      params.userId,
      params.filename,
      params.contentType,
      params.fileSizeBytes,
      params.storageUri,
    ],
  );
}

/** Returns an asset by its primary key, or null if not found. */
export async function getAssetById(assetId: string): Promise<Asset | null> {
  const [rows] = await pool.execute<AssetRow[]>(
    'SELECT * FROM project_assets_current WHERE asset_id = ?',
    [assetId],
  );
  return rows.length ? mapRowToAsset(rows[0]!) : null;
}

/** Returns all assets belonging to a project, ordered by creation date ascending. */
export async function getAssetsByProjectId(projectId: string): Promise<Asset[]> {
  const [rows] = await pool.execute<AssetRow[]>(
    'SELECT * FROM project_assets_current WHERE project_id = ? ORDER BY created_at ASC',
    [projectId],
  );
  return rows.map(mapRowToAsset);
}

/**
 * Returns true when at least one clip in `project_clips_current` references the given asset.
 * Used to enforce the referential-integrity rule before deletion.
 */
export async function isAssetReferencedByClip(assetId: string): Promise<boolean> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT 1 FROM project_clips_current WHERE asset_id = ? LIMIT 1',
    [assetId],
  );
  return rows.length > 0;
}

/**
 * Hard-deletes an asset row from `project_assets_current`.
 * Silent no-op when no row matches the given `assetId` — does not throw.
 */
export async function deleteAssetById(assetId: string): Promise<void> {
  await pool.execute(
    'DELETE FROM project_assets_current WHERE asset_id = ?',
    [assetId],
  );
}

/** Updates the status (and optional error message) of an asset in-place. */
export async function updateAssetStatus(
  assetId: string,
  status: AssetStatus,
  errorMessage?: string,
): Promise<void> {
  await pool.execute(
    `UPDATE project_assets_current
     SET status = ?, error_message = ?
     WHERE asset_id = ?`,
    [status, errorMessage ?? null, assetId],
  );
}

/**
 * Sets the `display_name` column on an asset row.
 * Pass `null` to clear a previously set display name.
 * Silent no-op when no row matches `assetId`.
 */
export async function updateAssetDisplayName(
  assetId: string,
  displayName: string | null,
): Promise<void> {
  await pool.execute(
    `UPDATE project_assets_current
     SET display_name = ?
     WHERE asset_id = ?`,
    [displayName, assetId],
  );
}

// ---------------------------------------------------------------------------
// Global list (cursor-paginated) — powers the wizard gallery endpoint
// ---------------------------------------------------------------------------

/** Filter applied to the global list query. A raw MIME prefix — the service maps enum buckets to this. */
export type AssetMimePrefix = 'video/' | 'image/' | 'audio/';

type FindReadyParams = {
  userId: string;
  /** Optional MIME prefix filter. Omit to return all three buckets. */
  mimePrefix?: AssetMimePrefix;
  /** Seek cursor: only return rows strictly older than `(updatedAt, assetId)`. */
  cursor?: { updatedAt: Date; assetId: string };
  /** Maximum rows to return. Clamped by the caller (1–100). */
  limit: number;
};

/**
 * Returns the authenticated user's `ready` assets, ordered newest first and
 * filtered by MIME prefix + seek cursor. Stable under concurrent inserts
 * because the cursor tiebreaks by `asset_id`.
 *
 * LIMIT is interpolated after a Number() coercion — safe because callers must
 * pass a pre-validated integer, and mysql2 prepared statements do not bind
 * LIMIT reliably across driver versions.
 */
export async function findReadyForUser(params: FindReadyParams): Promise<Asset[]> {
  const clauses: string[] = ['status = ?', 'user_id = ?'];
  const values: unknown[] = ['ready', params.userId];

  if (params.mimePrefix) {
    clauses.push('content_type LIKE ?');
    values.push(`${params.mimePrefix}%`);
  }

  if (params.cursor) {
    clauses.push('(updated_at, asset_id) < (?, ?)');
    values.push(params.cursor.updatedAt, params.cursor.assetId);
  }

  const safeLimit = Math.max(1, Math.min(100, Math.floor(Number(params.limit))));
  const sql =
    `SELECT * FROM project_assets_current
     WHERE ${clauses.join(' AND ')}
     ORDER BY updated_at DESC, asset_id DESC
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
 * Aggregates the user's `ready` assets by MIME bucket. Returns one row per
 * bucket that has at least one asset. Callers fill in zero for missing buckets.
 *
 * Note: `SUM(BIGINT)` returns a decimal string in mysql2 — we Number()-coerce
 * in the mapper to keep the repository type contract numeric.
 */
export async function getReadyTotalsForUser(userId: string): Promise<AssetTotalsRow[]> {
  const [rows] = await pool.query<TotalsRow[]>(
    `SELECT
       CASE
         WHEN content_type LIKE 'video/%' THEN 'video/'
         WHEN content_type LIKE 'image/%' THEN 'image/'
         WHEN content_type LIKE 'audio/%' THEN 'audio/'
         ELSE NULL
       END AS mime_prefix,
       COUNT(*) AS count,
       SUM(file_size_bytes) AS bytes
     FROM project_assets_current
     WHERE user_id = ? AND status = 'ready'
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
