import { useCallback } from 'react';

import type { AudioClip } from '@ai-video-editor/project-schema';

import { getSnapshot, setProject } from '@/store/project-store';

/**
 * Returns per-field handlers for editing an `AudioClip` in the audio inspector
 * panel.  Every handler reads the latest project snapshot (no stale closure)
 * and writes an updated document back through `setProject`.
 */
export function useAudioClipEditor(clip: AudioClip): {
  setStartFrame: (startFrame: number) => void;
  setEndFrame: (endFrame: number) => void;
  setTrimInSeconds: (seconds: number) => void;
  setVolume: (volume: number) => void;
} {
  const patchClip = useCallback(
    (patch: Partial<Omit<AudioClip, 'id' | 'type' | 'trackId' | 'assetId'>>) => {
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
   * Converts absolute end frame to `durationFrames`, clamped to a minimum of 1.
   * Reads fresh start frame to avoid stale-closure issues.
   */
  const setEndFrame = useCallback(
    (endFrame: number) => {
      const current = getSnapshot();
      const currentClip = current.clips.find((c) => c.id === clip.id);
      const startFrame = currentClip && currentClip.type === 'audio'
        ? currentClip.startFrame
        : clip.startFrame;
      const durationFrames = Math.max(1, Math.round(endFrame) - startFrame);
      patchClip({ durationFrames });
    },
    [clip.id, clip.startFrame, patchClip],
  );

  /**
   * Sets the asset offset (trim-in) in seconds, converted to frames using the
   * project fps.  The value is clamped to ≥ 0.
   */
  const setTrimInSeconds = useCallback(
    (seconds: number) => {
      const current = getSnapshot();
      // Use 30 fps as a safe fallback — fps should always be positive per the schema,
      // but guard against invalid values defensively.
      const fps = current.fps > 0 ? current.fps : 30;
      patchClip({ trimInFrame: Math.max(0, Math.round(seconds * fps)) });
    },
    [patchClip],
  );

  const setVolume = useCallback(
    (volume: number) => patchClip({ volume: Math.min(1, Math.max(0, volume)) }),
    [patchClip],
  );

  return { setStartFrame, setEndFrame, setTrimInSeconds, setVolume };
}
