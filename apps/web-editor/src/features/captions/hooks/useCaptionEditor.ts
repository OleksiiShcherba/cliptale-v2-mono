import { useCallback } from 'react';

import type { TextOverlayClip } from '@ai-video-editor/project-schema';

import { getSnapshot, setProject } from '@/store/project-store';

/**
 * Returns per-field handlers for editing a `TextOverlayClip` in the caption
 * inspector panel.  Every handler reads the latest project snapshot (no stale
 * closure) and writes an updated document back through `setProject` — the same
 * pattern as `useAddCaptionsToTimeline`.
 */
export function useCaptionEditor(clip: TextOverlayClip): {
  setText: (text: string) => void;
  setStartFrame: (startFrame: number) => void;
  setEndFrame: (endFrame: number) => void;
  setFontSize: (fontSize: number) => void;
  setColor: (color: string) => void;
  setPosition: (position: 'top' | 'center' | 'bottom') => void;
} {
  const patchClip = useCallback(
    (patch: Partial<Omit<TextOverlayClip, 'id' | 'type' | 'trackId'>>) => {
      const current = getSnapshot();
      setProject({
        ...current,
        clips: current.clips.map((c) =>
          c.id === clip.id ? { ...c, ...patch } : c,
        ),
      });
    },
    [clip.id],
  );

  const setText = useCallback(
    (text: string) => patchClip({ text }),
    [patchClip],
  );

  const setStartFrame = useCallback(
    (startFrame: number) => patchClip({ startFrame }),
    [patchClip],
  );

  /**
   * Converts an absolute end frame into `durationFrames`, clamped to a
   * minimum of 1 so the clip always has positive duration.
   */
  const setEndFrame = useCallback(
    (endFrame: number) => {
      const current = getSnapshot();
      const currentClip = current.clips.find((c) => c.id === clip.id);
      const startFrame = currentClip && currentClip.type === 'text-overlay'
        ? currentClip.startFrame
        : clip.startFrame;
      const durationFrames = Math.max(1, endFrame - startFrame);
      patchClip({ durationFrames });
    },
    [clip.id, clip.startFrame, patchClip],
  );

  const setFontSize = useCallback(
    (fontSize: number) => patchClip({ fontSize }),
    [patchClip],
  );

  const setColor = useCallback(
    (color: string) => patchClip({ color }),
    [patchClip],
  );

  const setPosition = useCallback(
    (position: 'top' | 'center' | 'bottom') => patchClip({ position }),
    [patchClip],
  );

  return { setText, setStartFrame, setEndFrame, setFontSize, setColor, setPosition };
}
