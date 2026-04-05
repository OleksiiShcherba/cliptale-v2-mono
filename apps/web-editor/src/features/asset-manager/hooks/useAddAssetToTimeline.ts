import { useCallback } from 'react';

import type { AudioClip, ImageClip, Track, VideoClip } from '@ai-video-editor/project-schema';

import type { Asset } from '@/features/asset-manager/types.js';
import { getSnapshot, setProject } from '@/store/project-store.js';

/** Track name and type produced for each supported media category. */
type TrackConfig = {
  trackType: Track['type'];
  trackName: string;
};

/** Maps a MIME type prefix to its corresponding track configuration. */
function resolveTrackConfig(contentType: string): TrackConfig | null {
  if (contentType.startsWith('video/')) return { trackType: 'video', trackName: 'Video 1' };
  if (contentType.startsWith('audio/')) return { trackType: 'audio', trackName: 'Audio 1' };
  if (contentType.startsWith('image/')) return { trackType: 'video', trackName: 'Image 1' };
  return null;
}

/**
 * Builds a typed clip object for the given media category.
 * Image clips default to `fps * 5` frames when the asset has no duration.
 */
function buildClip(
  contentType: string,
  assetId: string,
  trackId: string,
  startFrame: number,
  durationFrames: number,
): VideoClip | AudioClip | ImageClip {
  const id = crypto.randomUUID();
  if (contentType.startsWith('video/')) {
    return { id, type: 'video', assetId, trackId, startFrame, durationFrames, trimInFrame: 0, opacity: 1, volume: 1 };
  }
  if (contentType.startsWith('audio/')) {
    return { id, type: 'audio', assetId, trackId, startFrame, durationFrames, trimInFrame: 0, volume: 1 };
  }
  // image/*
  return { id, type: 'image', assetId, trackId, startFrame, durationFrames, opacity: 1 };
}

/**
 * Returns an `addAssetToTimeline(asset)` callback that:
 * 1. Maps the asset's `contentType` to a clip type and target track name.
 * 2. Reuses the first existing track with that name, or creates a new one.
 * 3. Appends the new clip at the end of all clips on that track.
 * 4. Calls `setProject()` — which auto-derives `durationFrames` via `computeProjectDuration`.
 *
 * Silently no-ops for unsupported content types (not video/*, audio/*, or image/*).
 */
export function useAddAssetToTimeline(): (asset: Asset) => void {
  return useCallback((asset: Asset) => {
    const config = resolveTrackConfig(asset.contentType);
    if (!config) return;

    const project = getSnapshot();

    // Find existing track by name, or create a new one.
    let track = project.tracks.find(t => t.name === config.trackName) ?? null;
    const newTracks = track
      ? project.tracks
      : [
          ...project.tracks,
          (track = {
            id: crypto.randomUUID(),
            type: config.trackType,
            name: config.trackName,
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

    // durationFrames: derive from asset duration; fall back to 5 s for images.
    const durationFrames =
      asset.durationSeconds != null && asset.durationSeconds > 0
        ? Math.max(1, Math.round(asset.durationSeconds * project.fps))
        : project.fps * 5;

    const clip = buildClip(asset.contentType, asset.id, track.id, startFrame, durationFrames);

    setProject({
      ...project,
      tracks: newTracks,
      clips: [...project.clips, clip],
    });
  }, []);
}
