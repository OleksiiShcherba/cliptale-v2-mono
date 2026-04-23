/**
 * useSceneModal — manages open/close state for SceneModal and wires save/delete
 * to the storyboard store.
 *
 * Extracted from StoryboardPage.tsx to keep that file under the 300-line cap.
 */

import { useState, useCallback } from 'react';

import { updateBlock, removeBlock } from '../store/storyboard-store';
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
 */
export function useSceneModal(): UseSceneModalResult {
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
    },
    [],
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
