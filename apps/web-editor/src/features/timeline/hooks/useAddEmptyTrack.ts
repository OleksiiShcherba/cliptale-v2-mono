import { useCallback } from 'react';

import type { Track } from '@ai-video-editor/project-schema';
import { getSnapshot as getProjectSnapshot, setProject } from '@/store/project-store';

/** Valid track types the user can create. */
export type TrackType = Track['type'];

/** Human-readable labels for each track type. */
export const TRACK_TYPE_LABELS: Record<TrackType, string> = {
  video: 'Video',
  audio: 'Audio',
  caption: 'Caption',
  overlay: 'Overlay',
};

/** Generates a unique track name of the form "Video 1", "Audio 2", etc. */
function generateTrackName(type: TrackType, existingTracks: readonly Track[]): string {
  const label = TRACK_TYPE_LABELS[type];
  const sameType = existingTracks.filter((t) => t.type === type);
  return `${label} ${sameType.length + 1}`;
}

/**
 * Returns a callback that creates a new empty track of the given type
 * and appends it to the project's track list.
 *
 * Does not create any clips — the track is empty by design.
 */
export function useAddEmptyTrack(): (type: TrackType) => void {
  return useCallback((type: TrackType) => {
    const project = getProjectSnapshot();

    const newTrack: Track = {
      id: crypto.randomUUID(),
      type,
      name: generateTrackName(type, project.tracks),
      muted: false,
      locked: false,
    };

    setProject({ ...project, tracks: [...project.tracks, newTrack] });
  }, []);
}
