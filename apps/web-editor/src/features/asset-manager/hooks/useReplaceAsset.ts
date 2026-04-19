import { useCallback } from 'react';

import { getSnapshot, setProject } from '@/store/project-store';

/**
 * Returns a `replaceAsset(oldFileId, newFileId)` callback that updates all
 * clips pointing to `oldFileId` so they point to `newFileId` instead.
 *
 * This is a local-only (soft) replacement — the old asset file is NOT deleted
 * from storage. The change is pushed through `setProject`, which means it is
 * tracked in the Immer patch history and can be reverted with Ctrl+Z or via
 * the version history panel.
 */
export function useReplaceAsset(): (oldFileId: string, newFileId: string) => void {
  return useCallback((oldFileId: string, newFileId: string) => {
    if (oldFileId === newFileId) return;

    const project = getSnapshot();

    const updatedClips = project.clips.map((clip) => {
      if ('fileId' in clip && clip.fileId === oldFileId) {
        return { ...clip, fileId: newFileId };
      }
      return clip;
    });

    setProject({ ...project, clips: updatedClips });
  }, []);
}
