import type { CaptionSegment } from '@ai-video-editor/project-schema';

import * as fileRepository from '@/repositories/file.repository.js';
import * as captionRepository from '@/repositories/caption.repository.js';
import { ConflictError, NotFoundError } from '@/lib/errors.js';
import { enqueueTranscriptionJob } from '@/queues/jobs/enqueue-transcription.js';

const DEFAULT_TRANSCRIPTION_LANGUAGE = 'en' as const;

/** Returned to the client after a successful POST /assets/:id/transcribe. */
export type TranscribeResult = {
  jobId: string;
};

/** Returned to the client for GET /assets/:id/captions. */
export type CaptionsResult = {
  segments: CaptionSegment[];
};

/**
 * Enqueues a transcription job for the given file.
 *
 * The `fileId` parameter corresponds to the `id` path param of
 * `POST /assets/:id/transcribe`. After migration 024, asset IDs were
 * reused as file IDs, so the wire value is identical.
 *
 * - Throws `NotFoundError` if no file with `fileId` exists in `files`.
 * - Throws `ConflictError` (409) if a caption track already exists for this
 *   file — transcription is idempotent and should not be re-triggered once
 *   segments are stored.
 */
export async function transcribeAsset(fileId: string): Promise<TranscribeResult> {
  const file = await fileRepository.findById(fileId);
  if (!file) {
    throw new NotFoundError(`File "${fileId}" not found`);
  }

  const existing = await captionRepository.getCaptionTrackByFileId(fileId);
  if (existing) {
    throw new ConflictError(`Caption track for file "${fileId}" already exists`);
  }

  const jobId = await enqueueTranscriptionJob({
    fileId,
    storageUri: file.storageUri,
    contentType: file.mimeType ?? 'application/octet-stream',
    language: DEFAULT_TRANSCRIPTION_LANGUAGE,
  });

  return { jobId };
}

/**
 * Returns transcript segments for a file.
 *
 * - Throws `NotFoundError` (404) if no caption track exists yet — the FE
 *   uses this to distinguish "not transcribed" from "transcribed but empty".
 */
export async function getCaptions(fileId: string): Promise<CaptionsResult> {
  const track = await captionRepository.getCaptionTrackByFileId(fileId);
  if (!track) {
    throw new NotFoundError(`No caption track found for file "${fileId}"`);
  }
  return { segments: track.segments };
}
