import { useCallback, useState } from 'react';

/**
 * Tracks which track is being dragged and which track is the current drop target.
 */
export type TrackReorderState = {
  /** The ID of the track being dragged. */
  draggingId: string | null;
  /** The ID of the track currently acting as the drop target. */
  overTargetId: string | null;
};

/**
 * Result returned by `useTrackReorder`. Provides state for visual feedback
 * and event handlers that TrackHeader attaches to its drag handle.
 */
export type UseTrackReorderResult = {
  reorderState: TrackReorderState;
  /** Call when drag starts on a track header. */
  onDragStart: (trackId: string) => void;
  /** Call on dragOver of a potential drop target track. */
  onDragOver: (trackId: string) => void;
  /** Call when drag leaves a track without dropping. */
  onDragLeave: (trackId: string) => void;
  /** Call when the drag ends (drop or cancel). */
  onDragEnd: () => void;
  /**
   * Call when the drag is dropped onto a target track.
   * Returns the new ordered track-id array, or null if no reorder is needed.
   */
  onDrop: (trackIds: string[]) => string[] | null;
};

/**
 * Manages the drag-and-drop state for reordering timeline tracks.
 * This hook is pure UI-state — it does NOT mutate the project store.
 * The caller (`TrackList`) is responsible for calling `setProject` when
 * `onDrop` returns a reordered array.
 *
 * Uses the native HTML Drag-and-Drop API (no external library) to stay
 * consistent with the asset drag-and-drop pattern used elsewhere in the editor.
 */
export function useTrackReorder(): UseTrackReorderResult {
  const [reorderState, setReorderState] = useState<TrackReorderState>({
    draggingId: null,
    overTargetId: null,
  });

  const onDragStart = useCallback((trackId: string) => {
    setReorderState({ draggingId: trackId, overTargetId: null });
  }, []);

  const onDragOver = useCallback((trackId: string) => {
    setReorderState((prev) => {
      if (prev.overTargetId === trackId) return prev;
      return { ...prev, overTargetId: trackId };
    });
  }, []);

  const onDragLeave = useCallback((trackId: string) => {
    setReorderState((prev) => {
      if (prev.overTargetId !== trackId) return prev;
      return { ...prev, overTargetId: null };
    });
  }, []);

  const onDragEnd = useCallback(() => {
    setReorderState({ draggingId: null, overTargetId: null });
  }, []);

  const onDrop = useCallback(
    (trackIds: string[]): string[] | null => {
      const { draggingId, overTargetId } = reorderState;

      if (!draggingId || !overTargetId || draggingId === overTargetId) {
        setReorderState({ draggingId: null, overTargetId: null });
        return null;
      }

      const fromIndex = trackIds.indexOf(draggingId);
      const toIndex = trackIds.indexOf(overTargetId);

      if (fromIndex === -1 || toIndex === -1) {
        setReorderState({ draggingId: null, overTargetId: null });
        return null;
      }

      // Build the new order by removing dragged item and inserting at target position.
      const reordered = [...trackIds];
      reordered.splice(fromIndex, 1);
      reordered.splice(toIndex, 0, draggingId);

      setReorderState({ draggingId: null, overTargetId: null });
      return reordered;
    },
    [reorderState],
  );

  return { reorderState, onDragStart, onDragOver, onDragLeave, onDragEnd, onDrop };
}
