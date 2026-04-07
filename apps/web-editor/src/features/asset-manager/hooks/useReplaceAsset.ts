import { useCallback } from 'react';

import { getSnapshot, setProject } from '@/store/project-store';

/**
 * Returns a `replaceAsset(oldAssetId, newAssetId)` callback that updates all
 * clips pointing to `oldAssetId` so they point to `newAssetId` instead.
 *
 * This is a local-only (soft) replacement — the old asset file is NOT deleted
 * from storage. The change is pushed through `setProject`, which means it is
 * tracked in the Immer patch history and can be reverted with Ctrl+Z or via
 * the version history panel.
 */
export function useReplaceAsset(): (oldAssetId: string, newAssetId: string) => void {
  return useCallback((oldAssetId: string, newAssetId: string) => {
    if (oldAssetId === newAssetId) return;

    const project = getSnapshot();

    const updatedClips = project.clips.map((clip) => {
      if ('assetId' in clip && clip.assetId === oldAssetId) {
        return { ...clip, assetId: newAssetId };
      }
      return clip;
    });

    setProject({ ...project, clips: updatedClips });
  }, []);
}
