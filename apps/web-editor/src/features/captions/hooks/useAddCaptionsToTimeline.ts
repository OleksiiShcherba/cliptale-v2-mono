import { useCallback } from 'react';

import type { TextOverlayClip, Track } from '@ai-video-editor/project-schema';

import { getSnapshot, setProject } from '@/store/project-store';
import type { CaptionSegment } from '@/features/captions/types';

/**
 * Returns a function that converts transcript segments into `TextOverlayClip` objects
 * and appends a new caption track to the project document.
 *
 * Frame math:
 *   startFrame     = Math.round(segment.start * fps)
 *   durationFrames = Math.max(1, Math.round((segment.end - segment.start) * fps))
 *
 * Naming: existing tracks whose names start with "Captions" are counted to generate
 * a unique name — "Captions 1", "Captions 2", etc.  Multiple caption tracks are
 * supported; there is no duplicate-track guard.
 */
export function useAddCaptionsToTimeline(): {
  addCaptionsToTimeline: (segments: CaptionSegment[]) => void;
} {
  const addCaptionsToTimeline = useCallback((segments: CaptionSegment[]) => {
    const current = getSnapshot();
    const { fps } = current;

    const captionsTrackCount = current.tracks.filter(
      (t: Track) => t.name.startsWith('Captions'),
    ).length;
    const trackName = `Captions ${captionsTrackCount + 1}`;

    const trackId = crypto.randomUUID();

    const newTrack: Track = {
      id: trackId,
      type: 'overlay',
      name: trackName,
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
