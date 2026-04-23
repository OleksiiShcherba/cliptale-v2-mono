/**
 * useStoryboardKeyboard — global keyboard shortcuts for the storyboard canvas.
 *
 * Shortcuts registered:
 * - `Delete`       — removes the currently selected node if it is a SCENE block.
 *                    START and END nodes are protected from deletion.
 * - `Ctrl+Z`       — calls historyStore.undo().
 * - `Ctrl+Y`       — calls historyStore.redo().
 * - `Ctrl+Shift+Z` — calls historyStore.redo() (alternate binding).
 *
 * Listeners are added on mount and removed on unmount — no leaks.
 */

import { useEffect, useRef } from 'react';

import type { Node } from '@xyflow/react';

import type { StoryboardHistoryStore } from '../store/storyboard-history-store';

// ── Types ──────────────────────────────────────────────────────────────────────

interface UseStoryboardKeyboardOptions {
  /** Current React Flow nodes — used to identify the selected node. */
  nodes: Node[];
  /** Removes a node by id from the canvas (no-op for non-scene nodes). */
  onRemoveNode: (nodeId: string) => void;
  /** History store providing undo/redo. Accepts the real store or the stub. */
  historyStore: StoryboardHistoryStore;
}

// ── Hook ───────────────────────────────────────────────────────────────────────

/**
 * Registers global keydown listeners for storyboard canvas shortcuts.
 * All handlers read from a mutable ref to avoid stale closure bugs.
 */
export function useStoryboardKeyboard({
  nodes,
  onRemoveNode,
  historyStore,
}: UseStoryboardKeyboardOptions): void {
  // Mutable refs prevent stale closures in the event listener.
  const nodesRef = useRef<Node[]>(nodes);
  const onRemoveNodeRef = useRef(onRemoveNode);
  const historyStoreRef = useRef<StoryboardHistoryStore>(historyStore);

  // Keep refs fresh on every render.
  nodesRef.current = nodes;
  onRemoveNodeRef.current = onRemoveNode;
  historyStoreRef.current = historyStore;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      const { key, ctrlKey, shiftKey } = event;

      // ── Delete — remove selected SCENE block ─────────────────────────────────
      if (key === 'Delete' && !ctrlKey) {
        const selectedNode = nodesRef.current.find((n) => n.selected);
        if (!selectedNode) return;

        // START and END nodes must never be deletable via keyboard.
        if (selectedNode.type === 'start' || selectedNode.type === 'end') return;

        event.preventDefault();
        onRemoveNodeRef.current(selectedNode.id);
        return;
      }

      // ── Ctrl+Shift+Z — redo (alternate binding) ──────────────────────────────
      if (ctrlKey && shiftKey && key === 'Z') {
        event.preventDefault();
        historyStoreRef.current.redo();
        return;
      }

      // ── Ctrl+Z — undo ────────────────────────────────────────────────────────
      if (ctrlKey && !shiftKey && key === 'z') {
        event.preventDefault();
        historyStoreRef.current.undo();
        return;
      }

      // ── Ctrl+Y — redo ────────────────────────────────────────────────────────
      if (ctrlKey && !shiftKey && key === 'y') {
        event.preventDefault();
        historyStoreRef.current.redo();
      }
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
    // Empty deps: the listener is registered once; refs handle fresh values.
  }, []);
}
