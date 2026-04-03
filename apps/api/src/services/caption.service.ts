import type { CaptionSegment } from '@ai-video-editor/project-schema';

import * as assetRepository from '@/repositories/asset.repository.js';
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
 * Enqueues a transcription job for the given asset.
 *
 * - Throws `NotFoundError` if the asset does not exist.
 * - Throws `ConflictError` (409) if a caption track already exists for this
 *   asset — transcription is idempotent and should not be re-triggered once
 *   segments are stored.
 */
export async function transcribeAsset(assetId: string): Promise<TranscribeResult> {
  const asset = await assetRepository.getAssetById(assetId);
  if (!asset) {
    throw new NotFoundError(`Asset "${assetId}" not found`);
  }

  const existing = await captionRepository.getCaptionTrackByAssetId(assetId);
  if (existing) {
    throw new ConflictError(`Caption track for asset "${assetId}" already exists`);
  }

  const jobId = await enqueueTranscriptionJob({
    assetId,
    storageUri: asset.storageUri,
    contentType: asset.contentType,
    language: DEFAULT_TRANSCRIPTION_LANGUAGE,
  });

  return { jobId };
}

/**
 * Returns transcript segments for an asset.
 *
 * - Throws `NotFoundError` (404) if no caption track exists yet — the FE
 *   uses this to distinguish "not transcribed" from "transcribed but empty".
 */
export async function getCaptions(assetId: string): Promise<CaptionsResult> {
  const track = await captionRepository.getCaptionTrackByAssetId(assetId);
  if (!track) {
    throw new NotFoundError(`No caption track found for asset "${assetId}"`);
  }
  return { segments: track.segments };
}
