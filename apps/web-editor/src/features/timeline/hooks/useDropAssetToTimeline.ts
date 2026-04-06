import { useCallback } from 'react';

import type { Asset } from '@/features/asset-manager/types';
import { buildClipForAsset, computeClipDurationFrames } from '@/features/asset-manager/utils';
import { getSnapshot as getProjectSnapshot, setProject } from '@/store/project-store';

import { createClip } from '../api';

/**
 * Returns a handler that builds and persists a new clip when an asset is dropped
 * onto a specific track lane at a specific start frame.
 *
 * Encapsulates the store mutation + createClip side effect so TimelinePanel
 * doesn't need to inline this logic.
 */
export function useDropAssetToTimeline(
  projectId: string,
): (asset: Asset, trackId: string, startFrame: number) => void {
  return useCallback(
    (asset: Asset, trackId: string, startFrame: number) => {
      const project = getProjectSnapshot();
      const durationFrames = computeClipDurationFrames(asset.durationSeconds, project.fps);
      const clip = buildClipForAsset(asset.contentType, asset.id, trackId, startFrame, durationFrames);
      if (!clip) return;

      setProject({ ...project, clips: [...project.clips, clip] });
      void createClip(projectId, clip);
    },
    [projectId],
  );
}
