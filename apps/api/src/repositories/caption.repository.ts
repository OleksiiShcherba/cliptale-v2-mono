import type { RowDataPacket } from 'mysql2/promise';

import type { CaptionSegment } from '@ai-video-editor/project-schema';

import { pool } from '@/db/connection.js';

export type { CaptionSegment };

/** Full caption track record as stored in `caption_tracks`. */
export type CaptionTrack = {
  captionTrackId: string;
  assetId: string;
  projectId: string;
  language: string;
  segments: CaptionSegment[];
  createdAt: Date;
};

/** Parameters for inserting a new caption track row. */
type InsertCaptionTrackParams = {
  captionTrackId: string;
  assetId: string;
  projectId: string;
  language: string;
  segmentsJson: CaptionSegment[];
};

type CaptionTrackRow = RowDataPacket & {
  caption_track_id: string;
  asset_id: string;
  project_id: string;
  language: string;
  segments_json: string | CaptionSegment[];
  created_at: Date;
};

function mapRowToCaptionTrack(row: CaptionTrackRow): CaptionTrack {
  const segments =
    typeof row.segments_json === 'string'
      ? (JSON.parse(row.segments_json) as CaptionSegment[])
      : (row.segments_json as CaptionSegment[]);
  return {
    captionTrackId: row.caption_track_id,
    assetId: row.asset_id,
    projectId: row.project_id,
    language: row.language,
    segments,
    createdAt: row.created_at,
  };
}

/**
 * Inserts a caption track row.
 *
 * Uses `INSERT IGNORE` so that concurrent or duplicate worker completions
 * for the same asset do not throw — the first writer wins.
 */
export async function insertCaptionTrack(params: InsertCaptionTrackParams): Promise<void> {
  await pool.execute(
    `INSERT IGNORE INTO caption_tracks
       (caption_track_id, asset_id, project_id, language, segments_json)
     VALUES (?, ?, ?, ?, ?)`,
    [
      params.captionTrackId,
      params.assetId,
      params.projectId,
      params.language,
      JSON.stringify(params.segmentsJson),
    ],
  );
}

/**
 * Returns the caption track for an asset, or null if transcription has not
 * completed yet.
 */
export async function getCaptionTrackByAssetId(assetId: string): Promise<CaptionTrack | null> {
  const [rows] = await pool.execute<CaptionTrackRow[]>(
    'SELECT * FROM caption_tracks WHERE asset_id = ? LIMIT 1',
    [assetId],
  );
  return rows.length ? mapRowToCaptionTrack(rows[0]!) : null;
}
