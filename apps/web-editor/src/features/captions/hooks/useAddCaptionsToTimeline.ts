import { useCallback } from 'react';

import type {
  CaptionClip,
  CaptionSegment,
  TextOverlayClip,
  Track,
} from '@ai-video-editor/project-schema';

import { getSnapshot, setProject } from '@/store/project-store';

/**
 * Returns a function that converts transcript segments into timeline clips
 * and appends a new caption track to the project document.
 *
 * Clip type selection:
 *   - Segments WITH `words[]` → `CaptionClip` (progressive-reveal; frame-converted words)
 *   - Segments WITHOUT `words[]` → `TextOverlayClip` (backward-compatible fallback)
 *
 * Frame math for segments:
 *   startFrame     = Math.round(segment.start * fps)
 *   durationFrames = Math.max(1, Math.round((segment.end - segment.start) * fps))
 *
 * Frame math for words inside a CaptionClip:
 *   word.startFrame = Math.round(word.start * fps)
 *   word.endFrame   = Math.round(word.end * fps)
 *   Last word: endFrame is capped at the segment's endFrame to avoid a 1-frame gap.
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

    const newClips: Array<TextOverlayClip | CaptionClip> = segments.map((seg) => {
      const startFrame = Math.round(seg.start * fps);
      const durationFrames = Math.max(1, Math.round((seg.end - seg.start) * fps));
      const segmentEndFrame = startFrame + durationFrames;

      if (seg.words && seg.words.length > 0) {
        const captionClip: CaptionClip = {
          id: crypto.randomUUID(),
          type: 'caption' as const,
          trackId,
          startFrame,
          durationFrames,
          words: seg.words.map((w, index) => {
            const wordEndFrame = Math.round(w.end * fps);
            const isLastWord = index === seg.words!.length - 1;
            return {
              word: w.word,
              startFrame: Math.round(w.start * fps),
              endFrame: isLastWord ? Math.min(wordEndFrame, segmentEndFrame) : wordEndFrame,
            };
          }),
          activeColor: '#FFFFFF',
          inactiveColor: 'rgba(255,255,255,0.35)',
          fontSize: 24,
          position: 'bottom' as const,
        };
        return captionClip;
      }

      const textOverlayClip: TextOverlayClip = {
        id: crypto.randomUUID(),
        type: 'text-overlay' as const,
        trackId,
        startFrame,
        durationFrames,
        text: seg.text,
        fontSize: 24,
        color: '#FFFFFF',
        position: 'bottom' as const,
      };
      return textOverlayClip;
    });

    setProject({
      ...current,
      tracks: [...current.tracks, newTrack],
      clips: [...current.clips, ...newClips],
    });
  }, []);

  return { addCaptionsToTimeline };
}
