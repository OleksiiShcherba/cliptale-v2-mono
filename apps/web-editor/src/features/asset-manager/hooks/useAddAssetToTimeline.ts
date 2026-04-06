import { useCallback } from 'react';

import type { Track } from '@ai-video-editor/project-schema';

import type { Asset } from '@/features/asset-manager/types.js';
import { buildClipForAsset, computeClipDurationFrames } from '@/features/asset-manager/utils.js';
import { getSnapshot, setProject } from '@/store/project-store.js';
import { createClip } from '@/features/timeline/api.js';

/** Maps a MIME type prefix to its corresponding track type. */
function resolveTrackType(contentType: string): Track['type'] | null {
  if (contentType.startsWith('video/')) return 'video';
  if (contentType.startsWith('audio/')) return 'audio';
  if (contentType.startsWith('image/')) return 'video'; // images use video tracks
  return null;
}

/** Strips the file extension from a filename (e.g. "my-clip.mp4" → "my-clip"). */
function stripExtension(filename: string): string {
  return filename.replace(/\.[^.]+$/, '');
}

/**
 * Returns an `addAssetToTimeline(asset)` callback that:
 * 1. Maps the asset's `contentType` to a track type; derives the track name from `asset.filename` (extension stripped).
 * 2. Reuses the first existing track with that name, or creates a new one.
 * 3. Appends the new clip at the end of all clips on that track.
 * 4. Calls `setProject()` — which auto-derives `durationFrames` via `computeProjectDuration`.
 * 5. Calls `createClip()` to persist the new clip row to `project_clips_current`.
 *
 * Silently no-ops for unsupported content types (not video/*, audio/*, or image/*).
 */
export function useAddAssetToTimeline(projectId: string): (asset: Asset) => void {
  return useCallback((asset: Asset) => {
    const trackType = resolveTrackType(asset.contentType);
    if (!trackType) return;

    const project = getSnapshot();
    const trackName = stripExtension(asset.filename);

    // Find existing track by name, or create a new one.
    let track = project.tracks.find(t => t.name === trackName) ?? null;
    const newTracks = track
      ? project.tracks
      : [
          ...project.tracks,
          (track = {
            id: crypto.randomUUID(),
            type: trackType,
            name: trackName,
            muted: false,
            locked: false,
          }),
        ];

    // startFrame = end frame of the last clip on this track, or 0 if no clips yet.
    const startFrame = project.clips
      .filter(c => c.trackId === track!.id)
      .reduce((max, c) => {
        const end = c.startFrame + c.durationFrames;
        return end > max ? end : max;
      }, 0);

    const durationFrames = computeClipDurationFrames(asset.durationSeconds, project.fps);
    const clip = buildClipForAsset(asset.contentType, asset.id, track.id, startFrame, durationFrames);
    if (!clip) return;

    setProject({
      ...project,
      tracks: newTracks,
      clips: [...project.clips, clip],
    });

    // Persist the new clip to project_clips_current in the database.
    void createClip(projectId, clip);
  }, [projectId]);
}
