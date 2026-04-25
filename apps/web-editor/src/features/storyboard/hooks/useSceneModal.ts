/**
 * useSceneModal — manages open/close state for SceneModal and wires save/delete
 * to the storyboard store.
 *
 * Extracted from StoryboardPage.tsx to keep that file under the 300-line cap.
 */

import { useState, useCallback } from 'react';

import { updateBlock, removeBlock, getSnapshot } from '../store/storyboard-store';
import { saveStoryboard } from '../api';
import type { StoryboardBlock } from '../types';
import type { SceneModalSavePayload } from '../components/SceneModal.types';

// ── Types ──────────────────────────────────────────────────────────────────────

type UseSceneModalResult = {
  /** The block currently being edited; null when the modal is closed. */
  editingBlock: StoryboardBlock | null;
  /** Opens the modal for the given block. */
  openModal: (block: StoryboardBlock) => void;
  /** Called by SceneModal onSave — writes to store then closes. */
  handleSave: (blockId: string, payload: SceneModalSavePayload) => void;
  /** Called by SceneModal onDelete — removes from store then closes. */
  handleDelete: (blockId: string) => void;
  /** Called by SceneModal onClose — dismisses without saving. */
  handleClose: () => void;
};

// ── Hook ───────────────────────────────────────────────────────────────────────

/**
 * Encapsulates SceneModal state and store interactions for StoryboardPage.
 *
 * @param draftId - The generation draft ID, used to immediately persist the
 *   storyboard after a scene is saved (bypasses the 5 s autosave debounce).
 */
export function useSceneModal(draftId: string): UseSceneModalResult {
  const [editingBlock, setEditingBlock] = useState<StoryboardBlock | null>(null);

  const openModal = useCallback((block: StoryboardBlock): void => {
    setEditingBlock(block);
  }, []);

  const handleSave = useCallback(
    (blockId: string, payload: SceneModalSavePayload): void => {
      updateBlock(blockId, {
        name: payload.name || null,
        prompt: payload.prompt,
        durationS: payload.durationS,
        style: payload.style,
        mediaItems: payload.mediaItems.map((m, i) => ({
          id: `${blockId}-media-${i}`,
          fileId: m.fileId,
          mediaType: m.mediaType,
          sortOrder: m.sortOrder,
        })),
      });
      setEditingBlock(null);

      // Immediately persist the updated block to the server, bypassing the
      // autosave debounce. The store has already been updated by updateBlock()
      // above, so getSnapshot() reflects the new state.
      if (draftId) {
        const { nodes, edges } = getSnapshot();
        const stateToSave = {
          blocks: nodes.map((node) => {
            if (node.type === 'scene-block') {
              const data = node.data as { block: import('../types').StoryboardBlock };
              return {
                ...data.block,
                positionX: node.position.x,
                positionY: node.position.y,
              };
            }
            return {
              id: node.id,
              draftId,
              blockType: (node.type === 'start' ? 'start' : 'end') as 'start' | 'end',
              name: null,
              prompt: null,
              durationS: 0,
              positionX: node.position.x,
              positionY: node.position.y,
              sortOrder: 0,
              style: null,
              createdAt: '',
              updatedAt: '',
              mediaItems: [],
            };
          }),
          edges: edges.map((e) => ({
            id: e.id,
            draftId,
            sourceBlockId: e.source,
            targetBlockId: e.target,
          })),
        };
        saveStoryboard(draftId, stateToSave).catch((err: unknown) => {
          console.error('[useSceneModal] Immediate save after scene edit failed:', err);
        });
      }
    },
    [draftId],
  );

  const handleDelete = useCallback((blockId: string): void => {
    removeBlock(blockId);
    setEditingBlock(null);
  }, []);

  const handleClose = useCallback((): void => {
    setEditingBlock(null);
  }, []);

  return { editingBlock, openModal, handleSave, handleDelete, handleClose };
}
