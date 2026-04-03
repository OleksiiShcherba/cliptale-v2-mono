import { useCallback } from 'react';

import type { TextOverlayClip, Track } from '@ai-video-editor/project-schema';

import { getSnapshot, setProject } from '@/store/project-store';
import type { CaptionSegment } from '@/features/captions/types';

const CAPTIONS_TRACK_NAME = 'Captions';

/**
 * Returns a function that converts transcript segments into `TextOverlayClip` objects
 * and appends a new "Captions" track to the project document.
 *
 * Frame math (per §Subtask 6 spec):
 *   startFrame     = Math.round(segment.start * fps)
 *   durationFrames = Math.max(1, Math.round((segment.end - segment.start) * fps))
 *
 * Idempotency: if a track named "Captions" already exists, the function returns
 * early without adding a duplicate track.
 */
export function useAddCaptionsToTimeline(): {
  addCaptionsToTimeline: (segments: CaptionSegment[]) => void;
} {
  const addCaptionsToTimeline = useCallback((segments: CaptionSegment[]) => {
    const current = getSnapshot();
    const { fps } = current;

    // Guard against duplicate captions tracks.
    const captionsTrackExists = current.tracks.some(
      (t: Track) => t.name === CAPTIONS_TRACK_NAME,
    );
    if (captionsTrackExists) return;

    const trackId = crypto.randomUUID();

    const newTrack: Track = {
      id: trackId,
      type: 'overlay',
      name: CAPTIONS_TRACK_NAME,
      muted: false,
      locked: false,
    };

    const newClips: TextOverlayClip[] = segments.map((seg) => ({
      id: crypto.randomUUID(),
      type: 'text-overlay' as const,
      trackId,
      startFrame: Math.round(seg.start * fps),
      durationFrames: Math.max(1, Math.round((seg.end - seg.start) * fps)),
      text: seg.text,
      fontSize: 24,
      color: '#FFFFFF',
      position: 'bottom' as const,
    }));

    setProject({
      ...current,
      tracks: [...current.tracks, newTrack],
      clips: [...current.clips, ...newClips],
    });
  }, []);

  return { addCaptionsToTimeline };
}
