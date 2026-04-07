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
 * Computes the startFrame for a new clip on a track:
 * the end frame of the last clip on that track, or 0 if the track is empty.
 */
function computeStartFrame(trackId: string, clips: ReadonlyArray<{ trackId: string; startFrame: number; durationFrames: number }>): number {
  return clips
    .filter(c => c.trackId === trackId)
    .reduce((max, c) => {
      const end = c.startFrame + c.durationFrames;
      return end > max ? end : max;
    }, 0);
}

/**
 * Returns an object with two callbacks for placing an asset on the timeline:
 *
 * - `addAssetToNewTrack(asset)` — always creates a new track named after the
 *   asset filename (extension stripped) and appends a clip at frame 0.
 *   Use this when the user selects "To New Video/Audio Track".
 *
 * - `addAssetToExistingTrack(asset, trackId)` — appends a clip to the end of
 *   the specified existing track.  No track is created.
 *   Use this when the user selects a specific existing track.
 *
 * Both functions silently no-op for unsupported content types (not video/*,
 * audio/*, or image/*) and call `createClip` to persist the new clip row.
 */
export function useAddAssetToTimeline(projectId: string): {
  addAssetToNewTrack: (asset: Asset) => void;
  addAssetToExistingTrack: (asset: Asset, trackId: string) => void;
} {
  const addAssetToNewTrack = useCallback((asset: Asset) => {
    const trackType = resolveTrackType(asset.contentType);
    if (!trackType) return;

    const project = getSnapshot();
    const trackName = stripExtension(asset.filename);

    const newTrack: Track = {
      id: crypto.randomUUID(),
      type: trackType,
      name: trackName,
      muted: false,
      locked: false,
    };

    const durationFrames = computeClipDurationFrames(asset.durationSeconds, project.fps);
    const clip = buildClipForAsset(asset.contentType, asset.id, newTrack.id, 0, durationFrames);
    if (!clip) return;

    setProject({
      ...project,
      tracks: [...project.tracks, newTrack],
      clips: [...project.clips, clip],
    });

    void createClip(projectId, clip);
  }, [projectId]);

  const addAssetToExistingTrack = useCallback((asset: Asset, trackId: string) => {
    const trackType = resolveTrackType(asset.contentType);
    if (!trackType) return;

    const project = getSnapshot();
    const track = project.tracks.find(t => t.id === trackId);
    if (!track) return;

    const startFrame = computeStartFrame(trackId, project.clips);
    const durationFrames = computeClipDurationFrames(asset.durationSeconds, project.fps);
    const clip = buildClipForAsset(asset.contentType, asset.id, trackId, startFrame, durationFrames);
    if (!clip) return;

    setProject({
      ...project,
      clips: [...project.clips, clip],
    });

    void createClip(projectId, clip);
  }, [projectId]);

  return { addAssetToNewTrack, addAssetToExistingTrack };
}
