/**
 * useStoryboardAutosave — debounced autosave for the storyboard canvas.
 *
 * Behaviour:
 * - Accepts `nodes` and `edges` from React state (via `useStoryboardCanvas`);
 *   fires a 30 s debounce on every change detected by a `useEffect`.
 * - On timer expiry, calls `PUT /storyboards/:draftId` with the current state
 *   only if the state has changed since the last successful save.
 * - Returns a `saveLabel` string for the top-bar indicator:
 *     "—"              → never saved (initial state)
 *     "Saving…"        → save in progress
 *     "Saved just now" → within 60 s of last save
 *     "Saved X ago"    → older than 60 s
 * - Registers a `beforeunload` listener that shows a browser confirmation dialog
 *   when there are unsaved changes (and attempts a best-effort synchronous hint
 *   — browsers do not allow custom messages in modern implementations).
 * - Does NOT surface save errors to the user (logs to console).
 *
 * Architecture note: autosave uses a direct API call, not TanStack Query,
 * because the 30 s debounce logic is custom and does not fit the mutation model.
 * The external `storyboard-store` subscription was removed in ST-FIX-3 because
 * that store is only updated by undo/redo, not by regular canvas interactions.
 * Subscribing to React state (nodes/edges props) guarantees every canvas change
 * triggers the debounce.
 */

import { useEffect, useRef, useState, useCallback } from 'react';

import type { Node, Edge } from '@xyflow/react';

import { saveStoryboard } from '../api';
import type { StoryboardState } from '../types';

// ── Constants ──────────────────────────────────────────────────────────────────

/** Autosave debounce window in ms. */
const AUTOSAVE_DEBOUNCE_MS = 5_000;

/** Label refresh interval — used to age "Saved X ago" labels. */
const LABEL_REFRESH_INTERVAL_MS = 30_000;

// ── Types ──────────────────────────────────────────────────────────────────────

export type AutosaveStatus = 'idle' | 'saving' | 'saved';

export type UseStoryboardAutosaveResult = {
  /** Human-readable autosave indicator text for the top-bar. */
  saveLabel: string;
  /** Triggers an immediate save bypassing the debounce timer. */
  saveNow: () => Promise<void>;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Converts the current state to a minimal serialisable object for comparison.
 * Uses JSON.stringify for a simple deep-equality check — acceptable for the
 * canvas graph structure which is at most a few hundred nodes/edges.
 */
function stateKey(nodes: StoryboardState['blocks'], edges: StoryboardState['edges']): string {
  return JSON.stringify({ nodes, edges });
}

/**
 * Converts elapsed seconds into a human-readable "X ago" string.
 */
function formatElapsed(seconds: number): string {
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes === 1) return '1 minute ago';
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours === 1) return '1 hour ago';
  return `${hours} hours ago`;
}

// ── Hook ───────────────────────────────────────────────────────────────────────

/**
 * Wires autosave logic for the storyboard canvas.
 *
 * @param draftId - The generation draft ID used as the storyboard identifier.
 * @param nodes   - React Flow nodes from `useStoryboardCanvas` (React state).
 * @param edges   - React Flow edges from `useStoryboardCanvas` (React state).
 */
export function useStoryboardAutosave(
  draftId: string,
  nodes: Node[],
  edges: Edge[],
): UseStoryboardAutosaveResult {
  const [status, setStatus] = useState<AutosaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  // Force a label refresh on the LABEL_REFRESH_INTERVAL tick.
  const [, setLabelTick] = useState(0);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSavingRef = useRef(false);
  // Key of the last state successfully saved — used to detect changes.
  const savedStateKeyRef = useRef<string | null>(null);
  // Key of the state at last save — used to detect "unsaved changes" for beforeunload.
  const lastSavedCheckRef = useRef<string | null>(null);

  // Mutable refs so `performSave` and `beforeunload` always read the latest values
  // without needing to be recreated when nodes/edges change.
  const nodesRef = useRef<Node[]>(nodes);
  const edgesRef = useRef<Edge[]>(edges);
  const draftIdRef = useRef<string>(draftId);

  // Keep mutable refs in sync with the latest props.
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);
  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);
  useEffect(() => {
    draftIdRef.current = draftId;
  }, [draftId]);

  // ── Core save function ────────────────────────────────────────────────────────

  const performSave = useCallback(async (): Promise<void> => {
    const currentDraftId = draftIdRef.current;
    if (isSavingRef.current || !currentDraftId) return;

    const currentNodes = nodesRef.current;
    const currentEdges = edgesRef.current;

    const currentKey = stateKey(
      currentNodes.map((n) => ({ id: n.id, ...n.data })) as unknown as StoryboardState['blocks'],
      currentEdges.map((e) => ({
        id: e.id,
        sourceBlockId: e.source,
        targetBlockId: e.target,
        draftId: currentDraftId,
      })) as StoryboardState['edges'],
    );

    // Skip save when state has not changed since last save.
    if (currentKey === savedStateKeyRef.current) return;

    isSavingRef.current = true;
    setStatus('saving');

    // Build a StoryboardState from the current React Flow state.
    const stateToSave: StoryboardState = {
      blocks: currentNodes.map((node) => {
        if (node.type === 'scene-block') {
          const data = node.data as { block: StoryboardState['blocks'][number] };
          return {
            ...data.block,
            positionX: node.position.x,
            positionY: node.position.y,
          };
        }
        // START / END sentinel — minimal shape matching StoryboardBlock.
        return {
          id: node.id,
          draftId: currentDraftId,
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
      edges: currentEdges.map((e) => ({
        id: e.id,
        draftId: currentDraftId,
        sourceBlockId: e.source,
        targetBlockId: e.target,
      })),
    };

    try {
      await saveStoryboard(currentDraftId, stateToSave);
      savedStateKeyRef.current = currentKey;
      lastSavedCheckRef.current = currentKey;
      setLastSavedAt(new Date());
      setStatus('saved');
    } catch (err: unknown) {
      console.error('[useStoryboardAutosave] Save failed:', err);
      setStatus('idle');
    } finally {
      isSavingRef.current = false;
    }
  }, []);

  // ── Manual save trigger ───────────────────────────────────────────────────────

  const saveNow = useCallback(async (): Promise<void> => {
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    await performSave();
  }, [performSave]);

  // ── React state subscription + debounce ───────────────────────────────────────

  /**
   * Subscribe to nodes/edges changes via useEffect. Each time nodes or edges
   * change, restart the 30 s debounce timer. This replaces the old
   * `subscribe()` call on the external storyboard-store, which was never
   * notified by regular canvas interactions.
   *
   * Intentionally excluded from dependencies: `performSave` is stable
   * (no deps in its useCallback), and we only want to re-arm the debounce when
   * the actual canvas data changes.
   */
  useEffect(() => {
    // Do not arm the debounce on the very first mount (no canvas change yet).
    // The ref starts as null; the effect runs once on mount and we skip the
    // initial arm by checking whether nodes/edges have content.
    if (nodes.length === 0 && edges.length === 0) return;

    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      void performSave();
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => {
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges]);

  // ── beforeunload guard ────────────────────────────────────────────────────────

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent): void => {
      const currentNodes = nodesRef.current;
      const currentEdges = edgesRef.current;
      const currentDraftId = draftIdRef.current;

      const currentKey = stateKey(
        currentNodes.map((n) => ({ id: n.id, ...n.data })) as unknown as StoryboardState['blocks'],
        currentEdges.map((e) => ({
          id: e.id,
          sourceBlockId: e.source,
          targetBlockId: e.target,
          draftId: currentDraftId,
        })) as StoryboardState['edges'],
      );
      const hasUnsaved = lastSavedCheckRef.current !== null
        ? currentKey !== lastSavedCheckRef.current
        : false;

      if (hasUnsaved) {
        // Modern browsers show a generic message; the returnValue triggers the dialog.
        event.preventDefault();
        event.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  // ── Label refresh timer ───────────────────────────────────────────────────────

  useEffect(() => {
    const interval = setInterval(() => {
      setLabelTick((t) => t + 1);
    }, LABEL_REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  // ── Derived label ─────────────────────────────────────────────────────────────

  let saveLabel: string;
  if (status === 'saving') {
    saveLabel = 'Saving…';
  } else if (status === 'saved' && lastSavedAt !== null) {
    const elapsedSeconds = Math.floor((Date.now() - lastSavedAt.getTime()) / 1000);
    saveLabel = `Saved ${formatElapsed(elapsedSeconds)}`;
  } else {
    saveLabel = '—';
  }

  return { saveLabel, saveNow };
}
