import { useCallback, useState } from 'react';

import type { Track, MotionGraphicClip } from '@ai-video-editor/project-schema';

import { getMotionGraphic } from '@/features/motion-graphic/api.js';
import type { MotionGraphicSummary } from '@/features/motion-graphic/types.js';
import { getSnapshot, setProject } from '@/store/project-store.js';
import { createClip } from '@/features/timeline/api.js';

/** Converts a duration in seconds to whole frames at the project fps (min 1). */
function durationToFrames(durationSeconds: number, fps: number): number {
  return Math.max(1, Math.round(durationSeconds * fps));
}

interface UseAddMotionGraphicToTimeline {
  /** Snapshots the chosen graphic's current code + adds it to the timeline. */
  add: (graphic: MotionGraphicSummary) => Promise<void>;
  /** The id currently being added (for per-row pending UI), or null. */
  pendingId: string | null;
  /** Last error message, or null. */
  error: string | null;
}

/**
 * Places a ready Motion Graphic on the project timeline as a `motion-graphic`
 * clip (ai-motion-graphic editor integration / US-07 on the project surface).
 *
 * On add it fetches the graphic's FULL record (its current authored `code` +
 * geometry), freezes that snapshot into a new clip on a fresh video track at
 * frame 0, commits it to the project store (which drives the live preview + the
 * autosave/version snapshot that persists the code), and mirrors the clip row in
 * `project_clips_current` so drag/trim PATCH works. Snapshot isolation mirrors
 * the storyboard attach (AC-04/AC-10): later refinements of the source graphic
 * do not alter this placed instance.
 */
export function useAddMotionGraphicToTimeline(projectId: string): UseAddMotionGraphicToTimeline {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const add = useCallback(async (graphic: MotionGraphicSummary): Promise<void> => {
    setError(null);
    setPendingId(graphic.id);
    try {
      const full = await getMotionGraphic(graphic.id);
      if (full.status !== 'ready' || !full.code) {
        setError('Only a ready, working graphic can be added.');
        return;
      }

      const project = getSnapshot();
      const fps = project.fps;

      const newTrack: Track = {
        id: crypto.randomUUID(),
        type: 'video',
        name: full.title,
        muted: false,
        locked: false,
      };

      const clip: MotionGraphicClip = {
        id: crypto.randomUUID(),
        type: 'motion-graphic',
        trackId: newTrack.id,
        startFrame: 0,
        durationFrames: durationToFrames(full.durationSeconds, fps),
        code: full.code,
        durationSeconds: full.durationSeconds,
        width: full.width,
        height: full.height,
        fps: full.fps ?? fps,
        opacity: 1,
        sourceMotionGraphicId: full.id,
      };

      setProject({
        ...project,
        tracks: [...project.tracks, newTrack],
        clips: [...project.clips, clip],
      });

      // Mirror the clip row so subsequent drag/trim PATCH operations resolve.
      // The authoritative code snapshot lives in the doc_json version snapshot;
      // a failed row insert must not lose the in-store clip, so swallow errors.
      void createClip(projectId, clip).catch(() => undefined);
    } catch {
      setError('Could not add the Motion Graphic. Please try again.');
    } finally {
      setPendingId(null);
    }
  }, [projectId]);

  return { add, pendingId, error };
}
