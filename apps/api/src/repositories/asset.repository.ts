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
