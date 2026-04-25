import type { RowDataPacket } from 'mysql2/promise';

import type { CaptionSegment } from '@ai-video-editor/project-schema';

import { pool } from '@/db/connection.js';

export type { CaptionSegment };

/** Full caption track record as stored in `caption_tracks`. */
export type CaptionTrack = {
  captionTrackId: string;
  /** `files.file_id` of the underlying SRT/VTT blob. */
  fileId: string;
  projectId: string;
  language: string;
  segments: CaptionSegment[];
  createdAt: Date;
};

/** Parameters for inserting a new caption track row. */
type InsertCaptionTrackParams = {
  captionTrackId: string;
  /** `files.file_id` for the source audio/video file being transcribed. */
  fileId: string;
  projectId: string;
  language: string;
  segmentsJson: CaptionSegment[];
};

type CaptionTrackRow = RowDataPacket & {
  caption_track_id: string;
  file_id: string;
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
    fileId: row.file_id,
    projectId: row.project_id,
    language: row.language,
    segments,
    createdAt: row.created_at,
  };
}

/**
 * Inserts a caption track row referencing a `files.file_id`.
 *
 * Uses `INSERT IGNORE` so that concurrent or duplicate worker completions
 * for the same file do not throw — the first writer wins.
 */
export async function insertCaptionTrack(params: InsertCaptionTrackParams): Promise<void> {
  await pool.execute(
    `INSERT IGNORE INTO caption_tracks
       (caption_track_id, file_id, project_id, language, segments_json)
     VALUES (?, ?, ?, ?, ?)`,
    [
      params.captionTrackId,
      params.fileId,
      params.projectId,
      params.language,
      JSON.stringify(params.segmentsJson),
    ],
  );
}

/**
 * Returns the caption track for a file, or null if transcription has not
 * completed yet.
 */
export async function getCaptionTrackByFileId(fileId: string): Promise<CaptionTrack | null> {
  const [rows] = await pool.execute<CaptionTrackRow[]>(
    'SELECT * FROM caption_tracks WHERE file_id = ? LIMIT 1',
    [fileId],
  );
  return rows.length ? mapRowToCaptionTrack(rows[0]!) : null;
}
