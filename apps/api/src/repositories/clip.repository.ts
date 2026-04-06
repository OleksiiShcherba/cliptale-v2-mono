import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise';

import { pool } from '@/db/connection.js';

/** Mutable timeline fields that can be patched on a clip. */
export type ClipPatch = {
  trackId?: string;
  startFrame?: number;
  durationFrames?: number;
  trimInFrames?: number;
  trimOutFrames?: number | null;
  transform?: Record<string, unknown> | null;
};

/** Updated clip record returned after a successful patch. */
export type ClipRow = {
  clipId: string;
  projectId: string;
  trackId: string;
  startFrame: number;
  durationFrames: number;
  trimInFrames: number;
  trimOutFrames: number | null;
  transform: Record<string, unknown> | null;
  updatedAt: Date;
};

type ClipDbRow = RowDataPacket & {
  clip_id: string;
  project_id: string;
  track_id: string;
  start_frame: number;
  duration_frames: number;
  trim_in_frames: number;
  trim_out_frames: number | null;
  transform_json: string | null;
  updated_at: Date;
};

function mapRow(row: ClipDbRow): ClipRow {
  // mysql2 may return JSON columns already parsed or as a string depending on driver version.
  let transform: Record<string, unknown> | null = null;
  if (row.transform_json !== null && row.transform_json !== undefined) {
    transform = typeof row.transform_json === 'string'
      ? (JSON.parse(row.transform_json) as Record<string, unknown>)
      : (row.transform_json as unknown as Record<string, unknown>);
  }

  return {
    clipId: row.clip_id,
    projectId: row.project_id,
    trackId: row.track_id,
    startFrame: row.start_frame,
    durationFrames: row.duration_frames,
    trimInFrames: row.trim_in_frames,
    trimOutFrames: row.trim_out_frames ?? null,
    transform,
    updatedAt: row.updated_at,
  };
}

/** Fields required to insert a new clip row. */
export type ClipInsert = {
  clipId: string;
  projectId: string;
  trackId: string;
  type: 'video' | 'audio' | 'text-overlay' | 'image';
  assetId?: string | null;
  startFrame: number;
  durationFrames: number;
  trimInFrames?: number;
  trimOutFrames?: number | null;
  layer?: number;
};

/**
 * Inserts a new clip row into project_clips_current.
 * Throws on duplicate clip_id (callers must use a fresh UUID).
 */
export async function insertClip(clip: ClipInsert): Promise<void> {
  await pool.execute<ResultSetHeader>(
    `INSERT INTO project_clips_current
       (clip_id, project_id, track_id, type, asset_id,
        start_frame, duration_frames, trim_in_frames, trim_out_frames, layer)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      clip.clipId,
      clip.projectId,
      clip.trackId,
      clip.type,
      clip.assetId ?? null,
      clip.startFrame,
      clip.durationFrames,
      clip.trimInFrames ?? 0,
      clip.trimOutFrames ?? null,
      clip.layer ?? 0,
    ],
  );
}

/**
 * Returns a single clip row for ownership validation.
 * Returns null when the clipId does not exist in project_clips_current.
 */
export async function getClipByIdAndProject(
  clipId: string,
  projectId: string,
): Promise<ClipRow | null> {
  const [rows] = await pool.execute<ClipDbRow[]>(
    `SELECT clip_id, project_id, track_id, start_frame, duration_frames,
            trim_in_frames, trim_out_frames, transform_json, updated_at
     FROM project_clips_current
     WHERE clip_id = ? AND project_id = ?`,
    [clipId, projectId],
  );
  return rows.length ? mapRow(rows[0]!) : null;
}

/**
 * Applies a partial update to the mutable timeline fields of a clip.
 * Only columns present in `patch` are written; all others are left unchanged.
 * Returns the updated clip row.
 */
export async function patchClip(
  clipId: string,
  projectId: string,
  patch: ClipPatch,
): Promise<ClipRow> {
  const setClauses: string[] = [];
  const values: (string | number | null)[] = [];

  if (patch.trackId !== undefined) {
    setClauses.push('track_id = ?');
    values.push(patch.trackId);
  }
  if (patch.startFrame !== undefined) {
    setClauses.push('start_frame = ?');
    values.push(patch.startFrame);
  }
  if (patch.durationFrames !== undefined) {
    setClauses.push('duration_frames = ?');
    values.push(patch.durationFrames);
  }
  if (patch.trimInFrames !== undefined) {
    setClauses.push('trim_in_frames = ?');
    values.push(patch.trimInFrames);
  }
  if ('trimOutFrames' in patch) {
    setClauses.push('trim_out_frames = ?');
    values.push(patch.trimOutFrames ?? null);
  }
  if ('transform' in patch) {
    setClauses.push('transform_json = ?');
    values.push(patch.transform !== null && patch.transform !== undefined
      ? JSON.stringify(patch.transform)
      : null);
  }

  // At least one field must be present — callers guarantee this via Zod validation.
  if (setClauses.length === 0) {
    throw new Error('patchClip called with empty patch — at least one field required');
  }

  values.push(clipId, projectId);

  await pool.execute<ResultSetHeader>(
    `UPDATE project_clips_current SET ${setClauses.join(', ')}
     WHERE clip_id = ? AND project_id = ?`,
    values,
  );

  // Re-fetch to return the authoritative updated state.
  const [rows] = await pool.execute<ClipDbRow[]>(
    `SELECT clip_id, project_id, track_id, start_frame, duration_frames,
            trim_in_frames, trim_out_frames, transform_json, updated_at
     FROM project_clips_current
     WHERE clip_id = ? AND project_id = ?`,
    [clipId, projectId],
  );

  if (!rows.length) {
    throw new Error(`Clip ${clipId} disappeared after update — concurrent delete?`);
  }

  return mapRow(rows[0]!);
}
