import { useCallback } from 'react';

import { getSnapshot, setProject } from '@/store/project-store';

/**
 * Returns a `deleteAsset(fileId)` callback that removes all clips referencing
 * `fileId` from the project document, along with any tracks that become empty
 * as a result.
 *
 * This is a soft operation — the asset file is NOT deleted from storage. The
 * change is pushed through `setProject`, which records Immer patches in the
 * history store. The user can undo with Ctrl+Z or restore a prior version from
 * Version History.
 */
export function useDeleteAsset(): (fileId: string) => void {
  return useCallback((fileId: string) => {
    const project = getSnapshot();

    // Remove all clips that reference the deleted asset
    const remainingClips = project.clips.filter(
      (clip) => !('fileId' in clip) || clip.fileId !== fileId,
    );

    // Find track IDs of clips that were removed
    const removedClipTrackIds = new Set(
      project.clips
        .filter((clip) => 'fileId' in clip && clip.fileId === fileId)
        .map((clip) => clip.trackId),
    );

    // Remove tracks that are now empty (had clips only from the deleted asset)
    const remainingTracks = project.tracks.filter((track) => {
      if (!removedClipTrackIds.has(track.id)) return true;
      // Keep the track if it still has other clips on it
      return remainingClips.some((clip) => clip.trackId === track.id);
    });

    setProject({ ...project, clips: remainingClips, tracks: remainingTracks });
  }, []);
}
