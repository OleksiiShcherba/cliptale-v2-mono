import { apiClient } from '@/lib/api-client';

import type { CaptionSegment } from './types';

/** Response from POST /assets/:id/transcribe. */
type TranscribeResponse = {
  jobId: string;
};

/** Response from GET /assets/:id/captions. */
type CaptionsResponse = {
  segments: CaptionSegment[];
};

/**
 * Triggers Whisper transcription for the given asset.
 * Returns the BullMQ job ID on success (202).
 * Throws on 409 (already transcribed) or any other error.
 */
export async function triggerTranscription(fileId: string): Promise<TranscribeResponse> {
  const res = await apiClient.post(`/assets/${fileId}/transcribe`, {});
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to trigger transcription (${res.status}): ${body}`);
  }
  return res.json() as Promise<TranscribeResponse>;
}

/**
 * Fetches transcript segments for an asset.
 * Returns `null` when the caption track does not yet exist (404 — not an error).
 * Throws on any other non-OK response.
 */
export async function getCaptions(fileId: string): Promise<CaptionsResponse | null> {
  const res = await apiClient.get(`/assets/${fileId}/captions`);
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to fetch captions (${res.status}): ${body}`);
  }
  return res.json() as Promise<CaptionsResponse>;
}
