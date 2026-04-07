import { useCallback } from 'react';

import type { ImageClip } from '@ai-video-editor/project-schema';

import { getSnapshot, setProject } from '@/store/project-store';

/**
 * Returns per-field handlers for editing an `ImageClip` in the image
 * inspector panel.  Every handler reads the latest project snapshot (no stale
 * closure) and writes an updated document back through `setProject`.
 */
export function useImageClipEditor(clip: ImageClip): {
  setStartFrame: (startFrame: number) => void;
  setDurationFrames: (durationFrames: number) => void;
  setOpacity: (opacity: number) => void;
} {
  const patchClip = useCallback(
    (patch: Partial<Omit<ImageClip, 'id' | 'type' | 'trackId' | 'assetId'>>) => {
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

  const setStartFrame = useCallback(
    (startFrame: number) => patchClip({ startFrame: Math.max(0, Math.round(startFrame)) }),
    [patchClip],
  );

  /**
   * Sets `durationFrames`, clamped to a minimum of 1 frame.
   */
  const setDurationFrames = useCallback(
    (durationFrames: number) => patchClip({ durationFrames: Math.max(1, Math.round(durationFrames)) }),
    [patchClip],
  );

  const setOpacity = useCallback(
    (opacity: number) => patchClip({ opacity: Math.min(1, Math.max(0, opacity)) }),
    [patchClip],
  );

  return { setStartFrame, setDurationFrames, setOpacity };
}
