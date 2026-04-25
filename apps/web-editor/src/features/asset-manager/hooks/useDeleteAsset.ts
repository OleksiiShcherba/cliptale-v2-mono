import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { deleteAsset } from '@/features/asset-manager/api';
import { getSnapshot, setProject } from '@/store/project-store';

interface UseDeleteAssetOptions {
  projectId: string;
}

/**
 * Returns an async `deleteAsset(fileId)` callback that:
 * 1. Removes every clip referencing the asset (and any now-empty tracks) from
 *    the in-memory project document via `setProject`, so the timeline + preview
 *    update immediately and the next autosave pushes the cleanup to the server.
 * 2. Calls `DELETE /assets/:id` to remove the file from the user's library and
 *    drop the `project_files` pivot row.
 * 3. Invalidates `['assets', projectId]` so `AssetBrowserPanel` refetches.
 *
 * Step 1 runs synchronously, step 2 is awaited — the caller can surface any
 * error thrown (e.g. 409 if a clip still references the file somewhere the
 * client didn't know about). Undo with Ctrl+Z reverts step 1 but does NOT
 * restore the deleted file.
 */
export function useDeleteAsset({ projectId }: UseDeleteAssetOptions): (fileId: string) => Promise<void> {
  const queryClient = useQueryClient();

  return useCallback(
    async (fileId: string) => {
      const project = getSnapshot();

      const remainingClips = project.clips.filter(
        (clip) => !('fileId' in clip) || clip.fileId !== fileId,
      );

      const removedClipTrackIds = new Set(
        project.clips
          .filter((clip) => 'fileId' in clip && clip.fileId === fileId)
          .map((clip) => clip.trackId),
      );

      const remainingTracks = project.tracks.filter((track) => {
        if (!removedClipTrackIds.has(track.id)) return true;
        return remainingClips.some((clip) => clip.trackId === track.id);
      });

      setProject({ ...project, clips: remainingClips, tracks: remainingTracks });

      await deleteAsset(fileId);
      await queryClient.invalidateQueries({ queryKey: ['assets', projectId] });
    },
    [projectId, queryClient],
  );
}
