/**
 * useStoryboardKnifeTool — Ctrl-hold knife mode for the storyboard canvas.
 *
 * Behaviour:
 * - `isKnifeActive` is `true` while the user holds Ctrl (or Meta on macOS) alone.
 * - As soon as any non-modifier key (e.g. `z`, `y`, `Delete`) is pressed while
 *   Ctrl is held, `isKnifeActive` returns to `false` so that standard shortcuts
 *   (`Ctrl+Z`, `Ctrl+Y`) continue to work without entering knife mode.
 * - `cutEdge(edgeId)` removes the named edge from the React Flow edge state,
 *   pushes a history snapshot, and schedules an immediate autosave.
 *
 * Design decisions:
 * - Lives in its own hook (not in `useStoryboardKeyboard`) because knife mode is
 *   canvas-scoped state rather than a global shortcut.
 * - The hook does NOT call `event.preventDefault()` on any keydown/keyup so that
 *   other listeners (e.g. `useStoryboardKeyboard`) still receive those events.
 * - `setTimeout(() => void saveNow(), 0)` is the project-wide pattern for
 *   triggering an immediate save after a React state change so the autosave hook
 *   reads the updated nodes/edges refs (see `useStoryboardDrag`).
 */

import { useState, useEffect, useCallback, useRef } from 'react';

import type { Node, Edge } from '@xyflow/react';

// ── Types ──────────────────────────────────────────────────────────────────────

interface UseStoryboardKnifeToolOptions {
  /** Current React Flow nodes — passed to pushSnapshot after an edge cut. */
  nodes: Node[];
  /** React Flow edge state setter — used to remove the cut edge. */
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  /**
   * Pushes a history snapshot that includes the updated edge list.
   * Called with the current nodes and the updated (post-cut) edges.
   */
  pushSnapshot: (nodes: Node[], edges: Edge[]) => Promise<void>;
  /**
   * Triggers an immediate autosave.
   * Scheduled via `setTimeout(..., 0)` so the autosave hook's refs are current.
   */
  saveNow: () => Promise<void>;
}

export type UseStoryboardKnifeToolResult = {
  /** True while the user holds Ctrl/Meta alone (no other non-modifier key). */
  isKnifeActive: boolean;
  /**
   * Removes the given edge from the canvas, pushes a history snapshot,
   * and schedules an immediate autosave.
   */
  cutEdge: (edgeId: string) => void;
};

// ── Modifier-only key check ────────────────────────────────────────────────────

/** Keys that are considered modifier-only and do NOT exit knife mode. */
const MODIFIER_KEYS = new Set(['Control', 'Meta', 'Alt', 'Shift']);

// ── Hook ───────────────────────────────────────────────────────────────────────

/**
 * Provides knife-tool state and the `cutEdge` callback for the storyboard canvas.
 *
 * Registers `keydown` / `keyup` listeners on `window` (never adds more than one
 * pair — refs are used so the effect runs once and is cleaned up on unmount).
 */
export function useStoryboardKnifeTool({
  nodes,
  setEdges,
  pushSnapshot,
  saveNow,
}: UseStoryboardKnifeToolOptions): UseStoryboardKnifeToolResult {
  const [isKnifeActive, setIsKnifeActive] = useState(false);

  // Mutable refs so the event handlers always read the latest values without
  // needing to be recreated on every render.
  const nodesRef = useRef<Node[]>(nodes);
  const pushSnapshotRef = useRef(pushSnapshot);
  const saveNowRef = useRef(saveNow);
  const setEdgesRef = useRef(setEdges);

  // Keep refs current.
  nodesRef.current = nodes;
  pushSnapshotRef.current = pushSnapshot;
  saveNowRef.current = saveNow;
  setEdgesRef.current = setEdges;

  // ── Keydown / keyup listeners ──────────────────────────────────────────────

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      const { key, ctrlKey, metaKey } = event;

      // If a non-modifier key is pressed while Ctrl/Meta is held, exit knife
      // mode immediately so shortcuts like Ctrl+Z, Ctrl+Y still work normally.
      if ((ctrlKey || metaKey) && !MODIFIER_KEYS.has(key)) {
        setIsKnifeActive(false);
        return;
      }

      // Entering knife mode: Ctrl or Meta pressed alone (no non-modifier also down).
      if (key === 'Control' || key === 'Meta') {
        setIsKnifeActive(true);
      }
    }

    function handleKeyUp(event: KeyboardEvent): void {
      // Releasing Ctrl or Meta exits knife mode.
      if (event.key === 'Control' || event.key === 'Meta') {
        setIsKnifeActive(false);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
    // Empty deps: listener registered once on mount; refs provide fresh values.
  }, []);

  // ── cutEdge ────────────────────────────────────────────────────────────────

  const cutEdge = useCallback((edgeId: string): void => {
    // Build the updated edge list synchronously to pass to pushSnapshot.
    let edgesAfterCut: Edge[] = [];

    setEdgesRef.current((prev) => {
      edgesAfterCut = prev.filter((e) => e.id !== edgeId);
      return edgesAfterCut;
    });

    // Push a history snapshot using the post-cut edges.
    // `edgesAfterCut` is populated synchronously inside the setEdges updater
    // before the React state flush, so it is always the correct array here.
    void pushSnapshotRef.current(nodesRef.current, edgesAfterCut);

    // Schedule an immediate autosave so the autosave hook's nodesRef/edgesRef
    // (which are updated asynchronously) are current before performSave runs.
    setTimeout(() => void saveNowRef.current(), 0);
  }, []);

  return { isKnifeActive, cutEdge };
}
