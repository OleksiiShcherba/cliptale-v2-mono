import { useCallback } from 'react';

import type { CaptionClip, TextOverlayClip } from '@ai-video-editor/project-schema';

import { getSnapshot, setProject } from '@/store/project-store';

// ---------------------------------------------------------------------------
// Shared field setters returned for both clip types
// ---------------------------------------------------------------------------

type SharedSetters = {
  setStartFrame: (startFrame: number) => void;
  setEndFrame: (endFrame: number) => void;
  setFontSize: (fontSize: number) => void;
  setPosition: (position: 'top' | 'center' | 'bottom') => void;
};

// ---------------------------------------------------------------------------
// Per-type setter shapes
// ---------------------------------------------------------------------------

export type TextOverlayEditorSetters = SharedSetters & {
  type: 'text-overlay';
  setText: (text: string) => void;
  setColor: (color: string) => void;
};

export type CaptionEditorSetters = SharedSetters & {
  type: 'caption';
  setActiveColor: (color: string) => void;
  setInactiveColor: (color: string) => void;
};

// ---------------------------------------------------------------------------
// Overloads — callers get the narrowed return type per clip type
// ---------------------------------------------------------------------------

export function useCaptionEditor(clip: TextOverlayClip): TextOverlayEditorSetters;
export function useCaptionEditor(clip: CaptionClip): CaptionEditorSetters;
export function useCaptionEditor(
  clip: TextOverlayClip | CaptionClip,
): TextOverlayEditorSetters | CaptionEditorSetters;

/**
 * Returns per-field handlers for editing a `TextOverlayClip` or `CaptionClip`
 * in the caption inspector panel.  Every handler reads the latest project
 * snapshot (no stale closure) and writes an updated document back through
 * `setProject` — the same pattern as `useAddCaptionsToTimeline`.
 *
 * - When `clip.type === 'text-overlay'`: returns `TextOverlayEditorSetters`
 *   (includes `setText` and `setColor`).
 * - When `clip.type === 'caption'`: returns `CaptionEditorSetters`
 *   (includes `setActiveColor` and `setInactiveColor`).
 */
export function useCaptionEditor(
  clip: TextOverlayClip | CaptionClip,
): TextOverlayEditorSetters | CaptionEditorSetters {
  const patchClip = useCallback(
    (patch: Record<string, unknown>) => {
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
      const startFrame =
        currentClip &&
        (currentClip.type === 'text-overlay' || currentClip.type === 'caption')
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

  const setPosition = useCallback(
    (position: 'top' | 'center' | 'bottom') => patchClip({ position }),
    [patchClip],
  );

  // text-overlay-only setters (called unconditionally — rules of hooks)
  const setText = useCallback(
    (text: string) => patchClip({ text }),
    [patchClip],
  );

  const setColor = useCallback(
    (color: string) => patchClip({ color }),
    [patchClip],
  );

  // caption-only setters (called unconditionally — rules of hooks)
  const setActiveColor = useCallback(
    (activeColor: string) => patchClip({ activeColor }),
    [patchClip],
  );

  const setInactiveColor = useCallback(
    (inactiveColor: string) => patchClip({ inactiveColor }),
    [patchClip],
  );

  if (clip.type === 'caption') {
    return {
      type: 'caption',
      setStartFrame,
      setEndFrame,
      setFontSize,
      setPosition,
      setActiveColor,
      setInactiveColor,
    };
  }

  return {
    type: 'text-overlay',
    setText,
    setStartFrame,
    setEndFrame,
    setFontSize,
    setColor,
    setPosition,
  };
}
