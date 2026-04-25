/**
 * Thin compatibility adapter over `files` + `project_files` that preserves the
 * legacy `Asset` type and function signatures consumed by the service layer.
 *
 * Migration note (2026-04-19): `project_assets_current` was dropped in migration 027.
 * This module now reads from `files` (user-scoped blob root) and joins `project_files`
 * wherever a `projectId` is required. A follow-up cleanup task should collapse direct
 * service calls into `file.repository.ts` / `fileLinks.repository.ts` and remove this
 * adapter entirely — it exists solely to preserve the public interface with zero blast
 * radius on callers.
 */
import type { RowDataPacket } from 'mysql2/promise';

import { pool } from '@/db/connection.js';

/**
 * Lifecycle status of an asset in the ingest pipeline.
 * `pending` → uploaded but not yet finalized; `processing` → ingest job running;
 * `ready` → metadata/thumbnail extracted; `error` → ingest failed.
 */
export type AssetStatus = 'pending' | 'processing' | 'ready' | 'error';

/** Full asset record, now backed by the `files` table. */
export type Asset = {
  fileId: string;
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
  /** S3/R2 URI of the generated thumbnail frame, or null when not yet generated. Populated after migration 030. */
  thumbnailUri: string | null;
  /** Always null — `files` has no waveform_json column; kept for API shape compatibility. */
  waveformJson: unknown | null;
  createdAt: Date;
  updatedAt: Date;
};

/** Parameters for inserting a new pending asset row. */
type InsertPendingAssetParams = {
  fileId: string;
  projectId: string;
  userId: string;
  filename: string;
  contentType: string;
  fileSizeBytes: number;
  storageUri: string;
};

/**
 * Internal DB row type for `files` LEFT JOIN `project_files`.
 * `project_id` comes from the pivot join — null when no project link exists.
 */
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
  /** Thumbnail S3/R2 URI — populated by migration 030. Null for pre-migration rows. */
  thumbnail_uri: string | null;
  created_at: Date;
  updated_at: Date;
};

/**
 * Maps a `files` LEFT JOIN `project_files` row to the legacy `Asset` shape.
 *
 * Fields not present on `files`:
 *  - `waveformJson`  → always null (no waveform_json column)
 *  - `fps`           → always null (no fps column; duration_ms is the replacement)
 *  - `filename`      → display_name ?? file_id (no dedicated filename column on files)
 *  - `fileSizeBytes` → bytes column (null coerced to 0 to preserve numeric contract)
 *  - `projectId`     → project_id from LEFT JOIN; empty string when file has no project link
 *  - `thumbnailUri`  → thumbnail_uri column added by migration 030; null for pre-migration rows
 */
function mapRowToAsset(row: AssetRow): Asset {
  return {
    fileId: row.file_id,
    // project_id is null when a file has no project_files row (user-scoped orphan).
    // We return an empty string to signal "no project" to callers that check truthiness.
    projectId: row.project_id ?? '',
    userId: row.user_id,
    // files has no separate filename column — use display_name or fall back to the PK.
    filename: row.display_name ?? row.file_id,
    displayName: row.display_name,
    contentType: row.mime_type ?? '',
    fileSizeBytes: row.bytes == null ? 0 : Number(row.bytes),
    storageUri: row.storage_uri,
    status: row.status,
    errorMessage: row.error_message,
    // files stores duration_ms (milliseconds); convert to approximate frames at 30fps.
    // This is a lossy approximation — the fps column no longer exists on files.
    durationFrames: row.duration_ms == null ? null : Math.round(row.duration_ms / 1000 * 30),
    width: row.width,
    height: row.height,
    fps: null, // no fps column on files; callers that need frame rate must look elsewhere
    thumbnailUri: row.thumbnail_uri ?? null, // added by migration 030; null for pre-migration rows
    waveformJson: null, // waveform_json does not exist on files
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Inserts a new `pending` file row into `files` and links it to the given project
 * via `project_files`. The two inserts are not wrapped in a transaction — if the
 * pivot insert fails the file row remains (an orphan that can be cleaned up by a
 * maintenance job). This matches the behaviour of the previous single-table insert.
 */
export async function insertPendingAsset(params: InsertPendingAssetParams): Promise<void> {
  // Derive the media kind from the MIME type prefix.
  let kind: 'video' | 'audio' | 'image' | 'other' = 'other';
  if (params.contentType.startsWith('video/')) kind = 'video';
  else if (params.contentType.startsWith('audio/')) kind = 'audio';
  else if (params.contentType.startsWith('image/')) kind = 'image';

  await pool.execute(
    `INSERT INTO files
       (file_id, user_id, kind, storage_uri, mime_type, bytes, display_name)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      params.fileId,
      params.userId,
      kind,
      params.storageUri,
      params.contentType,
      params.fileSizeBytes,
      params.filename,
    ],
  );

  await pool.execute(
    `INSERT IGNORE INTO project_files (project_id, file_id) VALUES (?, ?)`,
    [params.projectId, params.fileId],
  );
}

/** Returns a non-deleted asset by its primary key, or null if not found or soft-deleted. */
export async function getAssetById(fileId: string): Promise<Asset | null> {
  const [rows] = await pool.execute<AssetRow[]>(
    `SELECT f.*, pf.project_id
       FROM files f
       LEFT JOIN project_files pf ON pf.file_id = f.file_id AND pf.deleted_at IS NULL
      WHERE f.file_id = ? AND f.deleted_at IS NULL
      LIMIT 1`,
    [fileId],
  );
  return rows.length ? mapRowToAsset(rows[0]!) : null;
}

/** Returns all non-deleted assets belonging to a project, ordered by pivot creation date ascending. */
export async function getAssetsByProjectId(projectId: string): Promise<Asset[]> {
  const [rows] = await pool.execute<AssetRow[]>(
    `SELECT f.*, pf.project_id
       FROM project_files pf
       JOIN files f ON f.file_id = pf.file_id
      WHERE pf.project_id = ? AND pf.deleted_at IS NULL AND f.deleted_at IS NULL
      ORDER BY pf.created_at ASC`,
    [projectId],
  );
  return rows.map(mapRowToAsset);
}

/**
 * Returns true when at least one clip in `project_clips_current` references the
 * given file via `file_id`. Used to enforce referential integrity before deletion.
 */
export async function isAssetReferencedByClip(fileId: string): Promise<boolean> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT 1 FROM project_clips_current WHERE file_id = ? LIMIT 1',
    [fileId],
  );
  return rows.length > 0;
}

/**
 * Hard-deletes a file row from `files`.
 * Cascade or FK-order must be handled by the caller before invoking this function
 * (remove `project_files` rows first when the FK is RESTRICT).
 * Silent no-op when no row matches `fileId`.
 */
export async function deleteAssetById(fileId: string): Promise<void> {
  // Remove the project pivot first to satisfy the FK constraint (project_files → files).
  await pool.execute('DELETE FROM project_files WHERE file_id = ?', [fileId]);
  await pool.execute('DELETE FROM files WHERE file_id = ?', [fileId]);
}

/** Updates the status (and optional error message) of a file in-place. */
export async function updateAssetStatus(
  fileId: string,
  status: AssetStatus,
  errorMessage?: string,
): Promise<void> {
  await pool.execute(
    `UPDATE files
     SET status = ?, error_message = ?
     WHERE file_id = ?`,
    [status, errorMessage ?? null, fileId],
  );
}

/**
 * Sets the `display_name` column on a file row.
 * Pass `null` to clear a previously set display name.
 * Silent no-op when no row matches `fileId`.
 */
export async function updateAssetDisplayName(
  fileId: string,
  displayName: string | null,
): Promise<void> {
  await pool.execute(
    `UPDATE files
     SET display_name = ?
     WHERE file_id = ?`,
    [displayName, fileId],
  );
}

// ---------------------------------------------------------------------------
// Global list (cursor-paginated) — re-exported from asset.repository.list.ts
// Kept in a separate file to stay under the §9.7 300-line cap.
// ---------------------------------------------------------------------------
export type {
  AssetMimePrefix,
  AssetTotalsRow,
} from './asset.repository.list.js';
export {
  findReadyForUser,
  getReadyTotalsForUser,
} from './asset.repository.list.js';
