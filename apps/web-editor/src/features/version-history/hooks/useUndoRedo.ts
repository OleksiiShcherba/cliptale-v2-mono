import { useCallback } from 'react';
import { applyPatches } from 'immer';

import { getSnapshot as getProjectSnapshot, setProjectSilent } from '@/store/project-store';
import { undo, redo, useHistoryStore } from '@/store/history-store';

/**
 * Connects the `history-store` undo/redo stacks to the `project-store`.
 *
 * Returns:
 * - `canUndo` / `canRedo` — reactive flags for button disabled state
 * - `handleUndo` — pops the undo stack, applies inverse patches to the project
 * - `handleRedo` — pops the redo stack, applies forward patches to the project
 *
 * Uses `setProjectSilent` (not `setProject`) to apply the reverted state so
 * that the undo/redo operation itself does NOT get pushed back onto the history
 * stack — which would clear the redo stack and create an infinite loop.
 */
export function useUndoRedo(): {
  canUndo: boolean;
  canRedo: boolean;
  handleUndo: () => void;
  handleRedo: () => void;
} {
  const { canUndo, canRedo } = useHistoryStore();

  const handleUndo = useCallback(() => {
    const entry = undo();
    if (!entry) return;
    const current = getProjectSnapshot();
    const reverted = applyPatches(current, entry.inversePatches);
    setProjectSilent(reverted);
  }, []);

  const handleRedo = useCallback(() => {
    const entry = redo();
    if (!entry) return;
    const current = getProjectSnapshot();
    const reapplied = applyPatches(current, entry.patches);
    setProjectSilent(reapplied);
  }, []);

  return { canUndo, canRedo, handleUndo, handleRedo };
}
