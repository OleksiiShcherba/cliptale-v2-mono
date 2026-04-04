import { apiClient } from '@/lib/api-client';

/** Fields that can be partially updated on a clip via PATCH. */
export interface ClipPatchPayload {
  startFrame?: number;
  durationFrames?: number;
  trimInFrames?: number;
  trimOutFrames?: number;
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
