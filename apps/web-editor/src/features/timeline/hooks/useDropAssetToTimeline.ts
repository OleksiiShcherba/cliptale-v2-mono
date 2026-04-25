import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import type { Track } from '@ai-video-editor/project-schema';
import type { Asset } from '@/features/asset-manager/types';
import { buildClipForAsset, computeClipDurationFrames } from '@/features/asset-manager/utils';
import { getSnapshot as getProjectSnapshot, setProject } from '@/store/project-store';

import { createClip, linkFileToProject } from '../api';

/** Maps a MIME-type prefix to a track type, or null for unsupported types. */
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
 * Returns a handler that builds and persists a new clip when an asset is dropped
 * onto a specific track lane at a specific start frame.
 *
 * Encapsulates the store mutation + createClip side effect so TimelinePanel
 * doesn't need to inline this logic.
 */
export function useDropAssetToTimeline(
  projectId: string,
): (asset: Asset, trackId: string, startFrame: number) => void {
  const queryClient = useQueryClient();
  return useCallback(
    (asset: Asset, trackId: string, startFrame: number) => {
      const project = getProjectSnapshot();
      const durationFrames = computeClipDurationFrames(asset.durationSeconds, project.fps);
      const clip = buildClipForAsset(asset.contentType, asset.id, trackId, startFrame, durationFrames);
      if (!clip) return;

      setProject({ ...project, clips: [...project.clips, clip] });
      void createClip(projectId, clip);
      // Fire-and-forget: auto-link the file to the project so it appears in the
      // scoped file list, then invalidate so the panel refetches. Errors are
      // silent — the timeline state is already committed.
      void linkFileToProject(projectId, asset.id)
        .then(() => queryClient.invalidateQueries({ queryKey: ['assets', projectId] }))
        .catch(() => undefined);
    },
    [projectId, queryClient],
  );
}

/**
 * Returns a handler that drops an asset onto the timeline, automatically creating
 * a new track when no tracks exist yet.
 *
 * This is used when the user drags an asset onto the empty-timeline drop zone.
 * The track name is derived from the asset filename (extension stripped) and the
 * track type is inferred from the asset content type.
 *
 * Silently no-ops for unsupported content types (not video/*, audio/*, or image/*).
 */
export function useDropAssetWithAutoTrack(
  projectId: string,
): (asset: Asset, startFrame: number) => void {
  const queryClient = useQueryClient();
  return useCallback(
    (asset: Asset, startFrame: number) => {
      const trackType = resolveTrackType(asset.contentType);
      if (!trackType) return;

      const project = getProjectSnapshot();
      const trackName = stripExtension(asset.filename);

      // Reuse an existing track with the same name, or create a new one.
      let track = project.tracks.find((t) => t.name === trackName) ?? null;
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

      const durationFrames = computeClipDurationFrames(asset.durationSeconds, project.fps);
      const clip = buildClipForAsset(asset.contentType, asset.id, track.id, startFrame, durationFrames);
      if (!clip) return;

      setProject({ ...project, tracks: newTracks, clips: [...project.clips, clip] });
      void createClip(projectId, clip);
      // Fire-and-forget: auto-link the file to the project so it appears in the
      // scoped file list, then invalidate so the panel refetches. Errors are
      // silent — the timeline state is already committed.
      void linkFileToProject(projectId, asset.id)
        .then(() => queryClient.invalidateQueries({ queryKey: ['assets', projectId] }))
        .catch(() => undefined);
    },
    [projectId, queryClient],
  );
}
