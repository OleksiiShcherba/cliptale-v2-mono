/**
 * useHandleAddBlock — wraps `addBlock` to immediately persist the new block
 * after it is added to React state.
 *
 * Without this, the 30 s debounce in useStoryboardAutosave would leave the
 * block unpersisted across a page reload.
 *
 * `saveNow` clears the debounce timer and calls `performSave` immediately.
 * `void` is intentional — the returned `handleAddBlock` is typed as
 * `() => void` to match the `onAddBlock` prop on `StoryboardCanvas`.
 */

import { useCallback } from 'react';

type UseHandleAddBlockArgs = {
  /** Appends a new SCENE block to the React Flow canvas. */
  addBlock: () => void;
  /** Flushes the autosave debounce and persists immediately. */
  saveNow: () => Promise<void>;
};

type UseHandleAddBlockResult = {
  /** Calls `addBlock()` then `void saveNow()` to persist without waiting for debounce. */
  handleAddBlock: () => void;
};

/**
 * Returns a stable `handleAddBlock` callback that adds a new block to the
 * canvas and immediately triggers a save, bypassing the 30 s autosave debounce.
 */
export function useHandleAddBlock({
  addBlock,
  saveNow,
}: UseHandleAddBlockArgs): UseHandleAddBlockResult {
  const handleAddBlock = useCallback((): void => {
    addBlock();
    void saveNow();
  }, [addBlock, saveNow]);

  return { handleAddBlock };
}
