import { apiClient } from '@/lib/api-client';
import type { Clip } from '@ai-video-editor/project-schema';

/** Fields that can be partially updated on a clip via PATCH. */
export type ClipPatchPayload = {
  trackId?: string;
  startFrame?: number;
  durationFrames?: number;
  trimInFrames?: number;
  trimOutFrames?: number;
}

/**
 * POSTs a new clip row to project_clips_current.
 * Called after split/duplicate to ensure the new clip ID exists in the DB
 * before any subsequent PATCH operations are attempted.
 */
export async function createClip(projectId: string, clip: Clip): Promise<void> {
  const assetId = 'assetId' in clip ? (clip as { assetId: string }).assetId : undefined;
  const trimInFrame = 'trimInFrame' in clip ? (clip as { trimInFrame?: number }).trimInFrame : undefined;
  const trimOutFrame = 'trimOutFrame' in clip ? (clip as { trimOutFrame?: number }).trimOutFrame : undefined;
  const layer = 'layer' in clip ? (clip as { layer?: number }).layer : undefined;

  const res = await apiClient.post(`/projects/${projectId}/clips`, {
    clipId: clip.id,
    trackId: clip.trackId,
    type: clip.type,
    assetId: assetId ?? null,
    startFrame: clip.startFrame,
    durationFrames: clip.durationFrames,
    trimInFrames: trimInFrame ?? 0,
    trimOutFrames: trimOutFrame ?? null,
    layer: layer ?? 0,
  });

  if (!res.ok) {
    throw new Error(`Failed to create clip ${clip.id}: ${res.status}`);
  }
}

/**
 * Sends a PATCH request to update mutable timeline fields on a clip.
 * Intended for high-frequency drag/trim operations.
 *
 * @param projectId - The project the clip belongs to.
 * @param clipId    - The ID of the clip to update.
 * @param payload   - Partial clip fields to update (at least one required).
 */
export async function patchClip(
  projectId: string,
  clipId: string,
  payload: ClipPatchPayload,
): Promise<void> {
  const res = await apiClient.patch(
    `/projects/${projectId}/clips/${clipId}`,
    payload,
  );

  if (!res.ok) {
    throw new Error(`Failed to patch clip ${clipId}: ${res.status}`);
  }
}
