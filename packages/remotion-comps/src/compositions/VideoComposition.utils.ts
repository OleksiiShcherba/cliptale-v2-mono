import type { ProjectDoc } from '@ai-video-editor/project-schema';

type AnyClip = ProjectDoc['clips'][number];

export type PreparedClips = AnyClip[];

/**
 * Pre-processes project clips for rendering in VideoComposition.
 *
 * Extracted from the composition per §5 (business logic must not live in
 * Remotion compositions). This is a pure function with no side effects;
 * callers — the composition itself and tests — call it before passing clips
 * to the render tree.
 *
 * Rules applied:
 *   1. Clips whose parent track is muted are removed.
 *   2. Remaining clips are sorted by their track's position in
 *      `projectDoc.tracks` (lower index = lower z-order = renders first).
 *   3. The original `projectDoc.clips` array is never mutated.
 */
export function prepareClipsForComposition(projectDoc: ProjectDoc): PreparedClips {
  const trackIndexMap = new Map<string, number>(
    projectDoc.tracks.map((track, index) => [track.id, index])
  );
  const mutedTrackIds = new Set<string>(
    projectDoc.tracks.filter((track) => track.muted).map((track) => track.id)
  );

  return [...projectDoc.clips]
    .filter((clip) => !mutedTrackIds.has(clip.trackId))
    .sort((a, b) => {
      const aIndex = trackIndexMap.get(a.trackId) ?? 0;
      const bIndex = trackIndexMap.get(b.trackId) ?? 0;
      return aIndex - bIndex;
    });
}
