import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

import type { Job } from 'bullmq';
import { GetObjectCommand, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import ffmpeg from 'fluent-ffmpeg';
import type { Pool } from 'mysql2/promise';

import type { MediaIngestJobPayload } from '@ai-video-editor/project-schema';

import { parseStorageUri } from '@/lib/storage-uri.js';

export { parseStorageUri };

/** Number of waveform amplitude peaks returned for audio/video assets. */
const WAVEFORM_PEAKS = 200;

/**
 * Fallback FPS used when an asset has no video stream (i.e. pure audio files).
 * Audio clips must be represented as frame ranges on the timeline, so we use a
 * standard 30 fps assumption to convert `durationSeconds` → `durationFrames`.
 * The stored fps value is used in `toAssetApiResponse` to reconstruct
 * `durationSeconds = durationFrames / fps` for the frontend.
 */
const AUDIO_FPS_FALLBACK = 30;

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

// ── FFprobe / FFmpeg wrappers ─────────────────────────────────────────────────

function ffprobeAsync(input: string): Promise<ffmpeg.FfprobeData> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(input, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
}

function generateThumbnail(input: string, outputDir: string, filename: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(input)
      .screenshots({ count: 1, timemarks: ['0'], filename, folder: outputDir, size: '320x180' })
      .on('end', () => resolve())
      .on('error', reject);
  });
}

function extractWaveformPeaks(input: string, numPeaks: number): Promise<number[]> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    // Extract mono audio at 8 kHz as raw s16le and compute RMS peaks in memory.
    const stream = ffmpeg(input)
      .noVideo()
      .audioChannels(1)
      .audioFrequency(8_000)
      .format('s16le')
      .pipe() as NodeJS.ReadableStream;

    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('end', () => resolve(computeRmsPeaks(Buffer.concat(chunks), numPeaks)));
    stream.on('error', reject);
  });
}

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

async function uploadFile(
  s3: S3Client,
  bucket: string,
  key: string,
  filePath: string,
  contentType: string,
): Promise<void> {
  const body = await fs.readFile(filePath);
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
}

// ── DB helpers ────────────────────────────────────────────────────────────────

type AssetReadyParams = {
  durationFrames: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  thumbnailUri: string | null;
  waveformJson: number[] | null;
};

async function setAssetReady(pool: Pool, assetId: string, params: AssetReadyParams): Promise<void> {
  await pool.execute(
    `UPDATE project_assets_current
     SET status = 'ready', duration_frames = ?, width = ?, height = ?, fps = ?,
         thumbnail_uri = ?, waveform_json = ?, error_message = NULL
     WHERE asset_id = ?`,
    [
      params.durationFrames,
      params.width,
      params.height,
      params.fps,
      params.thumbnailUri,
      params.waveformJson ? JSON.stringify(params.waveformJson) : null,
      assetId,
    ],
  );
}

async function setAssetError(pool: Pool, assetId: string, message: string): Promise<void> {
  await pool.execute(
    `UPDATE project_assets_current SET status = 'error', error_message = ? WHERE asset_id = ?`,
    [message, assetId],
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
 * 1. Downloads the asset from S3 to a temp file.
 * 2. Runs FFprobe to extract duration, dimensions, and fps.
 * 3. Generates a 320×180 JPEG thumbnail for video assets.
 * 4. Generates 200-peak waveform JSON for audio/video assets.
 * 5. Uploads the thumbnail back to S3.
 * 6. Updates the asset row to `ready`.
 *
 * On any failure: updates the asset to `error` with the error message, then
 * re-throws so BullMQ retries the job per the configured `attempts`.
 */
export async function processIngestJob(
  job: Job<MediaIngestJobPayload>,
  deps: IngestJobDeps,
): Promise<void> {
  const { assetId, storageUri, contentType } = job.data;
  const { s3, pool } = deps;

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), `ingest-${assetId}-`));
  const tmpInput = path.join(tmpDir, 'asset');

  try {
    const { bucket, key } = parseStorageUri(storageUri);
    await downloadObject(s3, bucket, key, tmpInput);

    const probe = await ffprobeAsync(tmpInput);
    const videoStream = probe.streams.find(s => s.codec_type === 'video');
    const audioStream = probe.streams.find(s => s.codec_type === 'audio');
    const durationSec = parseFloat(String(probe.format.duration ?? 0));
    // For video assets, use the actual frame rate. For audio-only assets, use the
    // fallback so that durationFrames can be computed (audio clips need a frame
    // range on the timeline even though they have no video fps).
    const videoFps = videoStream?.r_frame_rate ? parseFps(videoStream.r_frame_rate) : null;
    const isAudioOnly = !videoStream && contentType.startsWith('audio/');
    const fps = videoFps ?? (isAudioOnly ? AUDIO_FPS_FALLBACK : null);
    const width = videoStream?.width ?? null;
    const height = videoStream?.height ?? null;
    const durationFrames = fps && durationSec ? Math.round(durationSec * fps) : null;

    let thumbnailUri: string | null = null;
    if (contentType.startsWith('video/') && videoStream) {
      const thumbFilename = 'thumbnail.jpg';
      await generateThumbnail(tmpInput, tmpDir, thumbFilename);
      const thumbKey = key.replace(/\/[^/]+$/, `/${thumbFilename}`);
      await uploadFile(s3, bucket, thumbKey, path.join(tmpDir, thumbFilename), 'image/jpeg');
      thumbnailUri = `s3://${bucket}/${thumbKey}`;
    }

    const hasAudio = contentType.startsWith('video/') || contentType.startsWith('audio/');
    const waveformJson =
      hasAudio && audioStream ? await extractWaveformPeaks(tmpInput, WAVEFORM_PEAKS) : null;

    await setAssetReady(pool, assetId, { durationFrames, width, height, fps, thumbnailUri, waveformJson });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown ingest error';
    await setAssetError(pool, assetId, message);
    throw err; // Re-throw so BullMQ retries per job.attempts.
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}
