/**
 * Pure action handlers for the clip context menu.
 * Extracted from ClipLane to keep that component under 300 lines.
 */

import type { Clip } from '@ai-video-editor/project-schema';

import { getSnapshot as getProjectSnapshot, setProject } from '@/store/project-store';
import { getSnapshot as getEphemeralSnapshot } from '@/store/ephemeral-store';

import { createClip } from '../api';

/**
 * Returns true when the playhead is strictly inside the clip
 * (not at the start edge), ensuring split produces two clips with
 * durationFrames >= 1.
 */
export function isPlayheadInsideClip(clip: Clip): boolean {
  const { playheadFrame } = getEphemeralSnapshot();
  return (
    playheadFrame > clip.startFrame &&
    playheadFrame < clip.startFrame + clip.durationFrames
  );
}

/**
 * Executes a clip context menu action against the project store.
 * Dispatches split/duplicate/delete and fires any required API calls.
 */
export function execClipContextMenuAction(
  action: 'split' | 'delete' | 'duplicate',
  clipId: string,
  projectId: string,
): void {
  const project = getProjectSnapshot();
  const clip = (project.clips ?? []).find((c) => c.id === clipId);
  if (!clip) return;

  if (action === 'delete') {
    const updatedClips = (project.clips ?? []).filter((c) => c.id !== clipId);
    setProject({ ...project, clips: updatedClips });
    return;
  }

  if (action === 'duplicate') {
    const duplicateClip: Clip = {
      ...clip,
      id: crypto.randomUUID(),
      startFrame: clip.startFrame + clip.durationFrames,
    };
    const updatedClips = [...(project.clips ?? []), duplicateClip];
    setProject({ ...project, clips: updatedClips });
    void createClip(projectId, duplicateClip);
    return;
  }

  if (action === 'split') {
    const { playheadFrame } = getEphemeralSnapshot();
    if (!isPlayheadInsideClip(clip)) return;

    const splitOffset = playheadFrame - clip.startFrame;

    const firstClip: Clip = {
      ...clip,
      durationFrames: splitOffset,
      ...(clip.type !== 'text-overlay'
        ? { trimOutFrame: (clip.type === 'video' || clip.type === 'audio')
            ? (clip.trimInFrame ?? 0) + splitOffset
            : undefined }
        : {}),
    };

    const secondClip: Clip = {
      ...clip,
      id: crypto.randomUUID(),
      startFrame: playheadFrame,
      durationFrames: clip.durationFrames - splitOffset,
      ...(clip.type !== 'text-overlay'
        ? { trimInFrame: (clip.type === 'video' || clip.type === 'audio')
            ? (clip.trimInFrame ?? 0) + splitOffset
            : 0 }
        : {}),
    };

    const updatedClips = (project.clips ?? []).flatMap((c) =>
      c.id === clipId ? [firstClip, secondClip] : [c],
    );
    setProject({ ...project, clips: updatedClips });

    void Promise.allSettled([
      createClip(projectId, firstClip),
      createClip(projectId, secondClip),
    ]);
  }
}
