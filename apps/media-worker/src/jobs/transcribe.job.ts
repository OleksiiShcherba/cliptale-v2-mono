import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { createWriteStream, createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';

import type { Job } from 'bullmq';
import { GetObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import type OpenAI from 'openai';
import type { Pool, RowDataPacket } from 'mysql2/promise';

import type { TranscriptionJobPayload, CaptionSegment } from '@ai-video-editor/project-schema';

import { parseStorageUri } from '@/lib/storage-uri.js';

export { parseStorageUri };

/** Whisper model used for all transcription jobs. */
const WHISPER_MODEL = 'whisper-1' as const;

// ── S3 helpers ────────────────────────────────────────────────────────────────

async function downloadObject(
  s3: S3Client,
  bucket: string,
  key: string,
  destPath: string,
): Promise<void> {
  const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const ws = createWriteStream(destPath);
  await pipeline(res.Body as Readable, ws);
}

// ── DB helpers ────────────────────────────────────────────────────────────────

/**
 * Looks up one project_id that the file is linked to via `project_files`.
 * Returns null when the file is not linked to any project.
 *
 * After migration 024, `assetId` in the job payload is reused as `file_id`.
 * The project context is needed for the `caption_tracks.project_id` column.
 */
async function getFileProjectId(pool: Pool, fileId: string): Promise<string | null> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT project_id FROM project_files WHERE file_id = ? LIMIT 1',
    [fileId],
  );
  return (rows[0]?.['project_id'] as string | undefined) ?? null;
}

async function insertCaptionTrack(
  pool: Pool,
  params: {
    captionTrackId: string;
    /** `files.file_id` — the source audio/video file that was transcribed. */
    fileId: string;
    projectId: string;
    language: string;
    segments: CaptionSegment[];
  },
): Promise<void> {
  await pool.execute(
    `INSERT IGNORE INTO caption_tracks
       (caption_track_id, file_id, project_id, language, segments_json)
     VALUES (?, ?, ?, ?, ?)`,
    [
      params.captionTrackId,
      params.fileId,
      params.projectId,
      params.language,
      JSON.stringify(params.segments),
    ],
  );
}

// ── Job handler ───────────────────────────────────────────────────────────────

/** Injected dependencies for `processTranscribeJob` — enables testing without real S3/DB/OpenAI. */
export type TranscribeJobDeps = {
  s3: S3Client;
  pool: Pool;
  openai: OpenAI;
};

/**
 * BullMQ job handler for `transcription` jobs.
 *
 * 1. Looks up the file's projectId from `project_files` (file_id = assetId in payload).
 * 2. Downloads the file from S3 to a temp file.
 * 3. Sends the audio/video file to the OpenAI Whisper API (`verbose_json`).
 * 4. Parses `segments[]` (start, end, text) from the response.
 * 5. Inserts the caption track row via `INSERT IGNORE` (idempotent).
 * 6. Cleans up the temp file in all cases (success or error).
 *
 * NOTE: `job.data.assetId` is now a `files.file_id` value after migration 024.
 * The field name in the payload retains `assetId` for backwards-compat until
 * Subtask 8 updates the TranscriptionJobPayload shape.
 *
 * On any failure: logs the error and re-throws so BullMQ retries per the
 * configured `attempts` (3x exponential backoff).
 */
export async function processTranscribeJob(
  job: Job<TranscriptionJobPayload>,
  deps: TranscribeJobDeps,
): Promise<void> {
  // `assetId` in the payload is a file_id value after migration 024.
  const { assetId: fileId, storageUri, language } = job.data;
  const { s3, pool, openai } = deps;

  const projectId = await getFileProjectId(pool, fileId);
  if (!projectId) {
    throw new Error(`File "${fileId}" not found in database — cannot transcribe`);
  }

  const { bucket, key } = parseStorageUri(storageUri);
  const origFilename = path.basename(key);
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), `transcribe-${fileId}-`));
  const tmpInput = path.join(tmpDir, origFilename);

  try {
    await downloadObject(s3, bucket, key, tmpInput);

    // Cast ReadStream to File — openai SDK accepts Node ReadStream at runtime but
    // TypeScript overload resolution requires File for the non-streaming variant.
    const transcription = await openai.audio.transcriptions.create({
      file: createReadStream(tmpInput) as unknown as File,
      model: WHISPER_MODEL,
      response_format: 'verbose_json',
      timestamp_granularities: ['word', 'segment'],
      ...(language ? { language } : {}),
    }) as unknown as OpenAI.Audio.TranscriptionVerbose;

    // Whisper returns word-level timing as a flat top-level `words` array
    // (only when `timestamp_granularities: ['word']` is requested), not
    // nested inside segments. We bucket each word into the segment whose
    // time window contains its start.
    const allWords = transcription.words ?? [];

    const segments: CaptionSegment[] = (transcription.segments ?? []).map((seg) => ({
      start: seg.start,
      end: seg.end,
      text: seg.text.trim(),
      words: allWords
        .filter((w) => w.start >= seg.start && w.start < seg.end)
        .map((w) => ({ word: w.word, start: w.start, end: w.end })),
    }));

    await insertCaptionTrack(pool, {
      captionTrackId: randomUUID(),
      fileId,
      projectId,
      language: language ?? 'auto',
      segments,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown transcription error';
    console.error(`[transcribe-job] Failed for file "${fileId}":`, message);
    throw err;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}
