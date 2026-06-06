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

import { saveStoryboard } from '@/features/storyboard/api';
import type { StoryboardSavePayload } from '@/features/storyboard/types';
import {
  toStoryboardMusicBlockSaveInputs,
  type StoryboardMusicBlockSaveCandidate,
} from '@/features/storyboard/utils/musicBlockSaveInput';

import {
  comparableBlocks,
  comparableEdges,
  formatElapsed,
  musicBlocksForSave,
  stateKey,
} from './useStoryboardAutosavePayload';

// ── Constants ──────────────────────────────────────────────────────────────────

/** Autosave debounce window in ms. */
const AUTOSAVE_DEBOUNCE_MS = 5_000;

/**
 * Delay before an automatic retry of a FAILED save (AC-01b): the hook keeps
 * retrying without user edits until the save succeeds; editing is never blocked.
 */
export const AUTOSAVE_RETRY_MS = 5_000;

/** Label refresh interval — used to age "Saved X ago" labels. */
const LABEL_REFRESH_INTERVAL_MS = 30_000;

// ── Types ──────────────────────────────────────────────────────────────────────

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export type UseStoryboardAutosaveResult = {
  /** Human-readable autosave indicator text for the top-bar. */
  saveLabel: string;
  /** Triggers an immediate save bypassing the debounce timer. */
  saveNow: (override?: StoryboardMusicSaveOverride) => Promise<void>;
};

export type StoryboardMusicSaveOverride = {
  musicBlocks?: StoryboardMusicBlockSaveCandidate[];
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function hasIncompleteExistingMusicSelection(
  musicBlocks: StoryboardSavePayload['musicBlocks'],
): boolean {
  return musicBlocks?.some((block) => (
    block.sourceMode === 'existing' && !block.existingFileId?.trim()
  )) ?? false;
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
  // Auto-retry timer armed after a failed save (AC-01b).
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Music override of the failed save, replayed verbatim by the retry.
  const retryOverrideRef = useRef<StoryboardMusicSaveOverride>({});
  const isSavingRef = useRef(false);
  const pendingSaveRef = useRef(false);
  const pendingMusicBlocksRef = useRef<StoryboardSavePayload['musicBlocks'] | undefined>(
    undefined,
  );
  // Key of the last payload successfully saved — used to dedupe explicit music saves.
  const savedPayloadKeyRef = useRef<string | null>(null);
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

  const performSave = useCallback(
    async (override: StoryboardMusicSaveOverride = {}): Promise<void> => {
      const currentDraftId = draftIdRef.current;
      if (!currentDraftId) return;
      const overrideMusicBlocks = toStoryboardMusicBlockSaveInputs(override.musicBlocks);
      if (isSavingRef.current) {
        pendingSaveRef.current = true;
        if (overrideMusicBlocks !== undefined) {
          pendingMusicBlocksRef.current = overrideMusicBlocks;
        }
        return;
      }

      const currentNodes = nodesRef.current;
      const currentEdges = edgesRef.current;
      const blocksToSave = comparableBlocks(currentNodes, currentDraftId);
      const edgesToSave = comparableEdges(currentEdges, currentDraftId);
      const currentMusicBlocks = musicBlocksForSave(currentNodes);
      const saveMusicBlocks = overrideMusicBlocks ?? currentMusicBlocks;

      // Switching to "Existing track" is a local editing state until an asset is chosen.
      // A full storyboard save with sourceMode=existing and no file id fails server validation.
      if (hasIncompleteExistingMusicSelection(saveMusicBlocks)) return;

      const currentPayloadKey = stateKey(blocksToSave, edgesToSave, saveMusicBlocks);
      const currentCheckKey = stateKey(blocksToSave, edgesToSave, currentMusicBlocks);

      // Skip save when state has not changed since last save.
      if (overrideMusicBlocks === undefined && currentPayloadKey === savedPayloadKeyRef.current) return;
      if (overrideMusicBlocks !== undefined && currentPayloadKey === savedPayloadKeyRef.current) return;

      isSavingRef.current = true;
      setStatus('saving');

      // A fresh attempt supersedes any armed retry.
      if (retryTimerRef.current !== null) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }

      // Build a StoryboardState from the current React Flow state.
      const stateToSave: StoryboardSavePayload = {
        blocks: blocksToSave,
        edges: edgesToSave,
        musicBlocks: saveMusicBlocks,
      };

      try {
        await saveStoryboard(currentDraftId, stateToSave);
        savedPayloadKeyRef.current = currentPayloadKey;
        lastSavedCheckRef.current = currentCheckKey;
        setLastSavedAt(new Date());
        setStatus('saved');
      } catch (err: unknown) {
        console.error('[useStoryboardAutosave] Save failed:', err);
        // AC-01b: surface the failure visibly and auto-retry without user
        // edits until success. Editing stays unblocked — the retry re-reads
        // the latest nodes/edges refs when it fires.
        setStatus('error');
        retryOverrideRef.current = override;
        retryTimerRef.current = setTimeout(() => {
          retryTimerRef.current = null;
          void performSave(retryOverrideRef.current);
        }, AUTOSAVE_RETRY_MS);
      } finally {
        isSavingRef.current = false;
        if (pendingSaveRef.current) {
          const pendingMusicBlocks = pendingMusicBlocksRef.current;
          pendingSaveRef.current = false;
          pendingMusicBlocksRef.current = undefined;
          void performSave(
            pendingMusicBlocks !== undefined
              ? { musicBlocks: pendingMusicBlocks }
              : {},
          );
        }
      }
    },
    [],
  );

  // ── Manual save trigger ───────────────────────────────────────────────────────

  const saveNow = useCallback(async (
    override: StoryboardMusicSaveOverride = {},
  ): Promise<void> => {
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    await performSave(override);
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
        comparableBlocks(currentNodes, currentDraftId),
        comparableEdges(currentEdges, currentDraftId),
        musicBlocksForSave(currentNodes),
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

  // ── Retry timer cleanup on unmount ────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (retryTimerRef.current !== null) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, []);

  // ── Derived label ─────────────────────────────────────────────────────────────

  let saveLabel: string;
  if (status === 'saving') {
    saveLabel = 'Saving…';
  } else if (status === 'error') {
    saveLabel = 'Not saved — retrying…';
  } else if (status === 'saved' && lastSavedAt !== null) {
    const elapsedSeconds = Math.floor((Date.now() - lastSavedAt.getTime()) / 1000);
    saveLabel = `Saved ${formatElapsed(elapsedSeconds)}`;
  } else {
    saveLabel = '—';
  }

  return { saveLabel, saveNow };
}
