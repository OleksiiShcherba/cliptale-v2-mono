import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

import type { Job } from 'bullmq';
import { GetObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import ffmpeg from 'fluent-ffmpeg';
import type { Pool } from 'mysql2/promise';

import type { MediaIngestJobPayload } from '@ai-video-editor/project-schema';

import { parseStorageUri } from '@/lib/storage-uri.js';

export { parseStorageUri };

/**
 * Parses an FFprobe `r_frame_rate` string (e.g. `"30000/1001"`) into a decimal fps value.
 * Returns `null` for zero-denominator or unparseable inputs.
 */
export function parseFps(rFrameRate: string): number | null {
  const [numStr, denStr] = rFrameRate.split('/');
  const num = parseFloat(numStr ?? '0');
  const den = parseFloat(denStr ?? '1');
  if (!den || !num) return null;
  return parseFloat((num / den).toFixed(4));
}

/**
 * Downsamples a signed 16-bit LE PCM buffer into `numPeaks` normalised RMS values (0–1).
 * Used to build the waveform JSON stored with each audio/video asset.
 */
export function computeRmsPeaks(pcmBuffer: Buffer, numPeaks: number): number[] {
  const bytesPerSample = 2; // s16le = 2 bytes
  const totalSamples = Math.floor(pcmBuffer.length / bytesPerSample);
  const samplesPerPeak = Math.max(1, Math.floor(totalSamples / numPeaks));
  const peaks: number[] = [];

  for (let i = 0; i < numPeaks; i++) {
    let sumSquares = 0;
    let count = 0;
    for (let j = 0; j < samplesPerPeak; j++) {
      const byteIdx = (i * samplesPerPeak + j) * bytesPerSample;
      if (byteIdx + 1 >= pcmBuffer.length) break;
      const sample = pcmBuffer.readInt16LE(byteIdx) / 32768;
      sumSquares += sample * sample;
      count++;
    }
    peaks.push(count > 0 ? Math.min(1, Math.sqrt(sumSquares / count)) : 0);
  }

  return peaks;
}

// ── FFprobe wrapper ───────────────────────────────────────────────────────────

function ffprobeAsync(input: string): Promise<ffmpeg.FfprobeData> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(input, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
}

// ── S3 helper ─────────────────────────────────────────────────────────────────

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

// ── DB helpers — `files` table ───────────────────────────────────────────────

type FileReadyParams = {
  durationMs: number | null;
  width: number | null;
  height: number | null;
  bytes: number | null;
};

/** Writes FFprobe results back to the `files` row and marks it `ready`. */
async function setFileReady(pool: Pool, fileId: string, params: FileReadyParams): Promise<void> {
  await pool.execute(
    `UPDATE files
     SET status = 'ready',
         duration_ms = ?,
         width = ?,
         height = ?,
         bytes = ?,
         error_message = NULL
     WHERE file_id = ?`,
    [params.durationMs, params.width, params.height, params.bytes, fileId],
  );
}

async function setFileError(pool: Pool, fileId: string, message: string): Promise<void> {
  await pool.execute(
    `UPDATE files SET status = 'error', error_message = ? WHERE file_id = ?`,
    [message, fileId],
  );
}

// ── Job handler ───────────────────────────────────────────────────────────────

/** Injected dependencies for `processIngestJob` — enables testing without real S3/DB. */
export type IngestJobDeps = {
  s3: S3Client;
  pool: Pool;
};

/**
 * BullMQ job handler for `media-ingest` jobs.
 *
 * 1. Downloads the file from S3 to a temp file.
 * 2. Runs FFprobe to extract duration, dimensions, and fps.
 * 3. Updates the `files` row to `ready` with extracted metadata.
 *
 * On any failure: updates the `files` row to `error` with the error message, then
 * re-throws so BullMQ retries the job per the configured `attempts`.
 */
export async function processIngestJob(
  job: Job<MediaIngestJobPayload>,
  deps: IngestJobDeps,
): Promise<void> {
  const { fileId, storageUri } = job.data;
  const { s3, pool } = deps;

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), `ingest-${fileId}-`));
  const tmpInput = path.join(tmpDir, 'asset');

  try {
    const { bucket, key } = parseStorageUri(storageUri);
    await downloadObject(s3, bucket, key, tmpInput);

    const probe = await ffprobeAsync(tmpInput);
    const videoStream = probe.streams.find(s => s.codec_type === 'video');
    const durationSec = parseFloat(String(probe.format.duration ?? 0));
    const width = videoStream?.width ?? null;
    const height = videoStream?.height ?? null;

    // duration_ms = durationSec × 1000, rounded to the nearest millisecond.
    const durationMs = durationSec > 0 ? Math.round(durationSec * 1000) : null;
    // bytes is not known from FFprobe alone; the S3 HEAD value is not available here.
    // Set to null — the finalize step already stored the client-declared size; a future
    // reconciliation step can back-fill from S3 HeadObject if needed.
    await setFileReady(pool, fileId, { durationMs, width, height, bytes: null });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown ingest error';
    await setFileError(pool, fileId, message);
    throw err; // Re-throw so BullMQ retries per job.attempts.
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}
