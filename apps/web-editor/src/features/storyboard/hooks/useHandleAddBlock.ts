/**
 * useHandleAddBlock — wraps `addBlock` for the StoryboardCanvas toolbar prop.
 *
 * `addBlock` owns the deferred save/history side effects because it has access
 * to the computed node list that includes the new block.
 */

import { useCallback } from 'react';

type UseHandleAddBlockArgs = {
  /** Appends a new SCENE block to the React Flow canvas. */
  addBlock: () => void;
};

type UseHandleAddBlockResult = {
  /** Calls `addBlock()`; `addBlock` schedules persistence after state update. */
  handleAddBlock: () => void;
};

/**
 * Returns a stable `handleAddBlock` callback that adds a new block to the canvas.
 */
export function useHandleAddBlock({
  addBlock,
}: UseHandleAddBlockArgs): UseHandleAddBlockResult {
  const handleAddBlock = useCallback((): void => {
    addBlock();
  }, [addBlock]);

  return { handleAddBlock };
}
