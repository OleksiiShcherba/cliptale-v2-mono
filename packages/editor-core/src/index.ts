/**
 * Timeline engine, selection model, Immer patch logic, and snap calculations.
 */

import type { Clip } from '@ai-video-editor/project-schema';

/**
 * Computes the total duration of a project in frames from the clips array.
 *
 * Returns the furthest end frame across all clips (`clip.startFrame + clip.durationFrames`),
 * floored at `fps * minSeconds` to guarantee the Remotion `<Player>` never
 * receives `durationInFrames=0`.
 *
 * @param clips - All clips across all tracks.
 * @param fps - Frames per second of the project.
 * @param minSeconds - Minimum duration in seconds (default: 5). Must be > 0.
 */
export function computeProjectDuration(
  clips: Clip[],
  fps: number,
  minSeconds = 5,
): number {
  const minFrames = fps * minSeconds;

  if (clips.length === 0) {
    return minFrames;
  }

  const maxEndFrame = clips.reduce((max, clip) => {
    const endFrame = clip.startFrame + clip.durationFrames;
    return endFrame > max ? endFrame : max;
  }, 0);

  return Math.max(maxEndFrame, minFrames);
}
