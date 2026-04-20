import { useEffect, useRef } from 'react';

import { getUiState, putUiState } from '@/features/project/api';
import {
  subscribe,
  getSnapshot,
  setAll,
  type EphemeralState,
} from '@/store/ephemeral-store';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Debounce window in milliseconds for coalescing rapid save calls. */
const DEBOUNCE_MS = 800;

/**
 * Fields captured for server persistence.
 * Selection is excluded (clips may be absent on next open).
 * Volume/mute is a device preference — not project-scoped.
 */
type PersistedUiState = Pick<EphemeralState, 'playheadFrame' | 'zoom' | 'pxPerFrame' | 'scrollOffsetX'>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractPersisted(s: EphemeralState): PersistedUiState {
  return {
    playheadFrame: s.playheadFrame,
    zoom: s.zoom,
    pxPerFrame: s.pxPerFrame,
    scrollOffsetX: s.scrollOffsetX,
  };
}

function isPersistedUiState(v: unknown): v is PersistedUiState {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return (
    typeof obj['playheadFrame'] === 'number' &&
    typeof obj['zoom'] === 'number' &&
    typeof obj['pxPerFrame'] === 'number' &&
    typeof obj['scrollOffsetX'] === 'number'
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Loads persisted UI state from the server when the project becomes ready, then
 * subscribes to ephemeral-store changes and debounce-saves them back to the
 * server at most once per 800 ms. A `beforeunload` handler flushes any pending
 * save before the page is torn down.
 *
 * Must be called AFTER the project document is hydrated (i.e. when
 * `isProjectReady` is true) to avoid applying a saved playheadFrame that
 * exceeds the current project's clip duration.
 *
 * @param projectId  The active project UUID.
 * @param isProjectReady  True once `useProjectInit` transitions to `ready`.
 */
export function useProjectUiState(projectId: string, isProjectReady: boolean): void {
  // Holds the debounce timer handle so we can cancel or flush it.
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks the most recent state pending save so the flush has access to it.
  const pendingStateRef = useRef<PersistedUiState | null>(null);

  // ── Phase 1: restore persisted state once the project doc is ready ────────
  useEffect(() => {
    if (!isProjectReady || !projectId) return;

    let cancelled = false;

    getUiState(projectId)
      .then(({ state }) => {
        if (cancelled) return;
        if (state === null || state === undefined) {
          // First open: no stored state — leave defaults in place.
          return;
        }
        if (!isPersistedUiState(state)) {
          // Corrupt or legacy shape — ignore gracefully.
          return;
        }
        setAll(state);
      })
      .catch(() => {
        // Network errors on restore are non-fatal; the editor works with defaults.
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, isProjectReady]);

  // ── Phase 2: subscribe + debounced save ───────────────────────────────────
  useEffect(() => {
    if (!isProjectReady || !projectId) return;

    /** Immediately flushes the pending save without waiting for the debounce. */
    function flushPending(): void {
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      if (pendingStateRef.current !== null) {
        const state = pendingStateRef.current;
        pendingStateRef.current = null;
        // Fire-and-forget: beforeunload gives us no await budget.
        void putUiState(projectId, state);
      }
    }

    /** Called by ephemeral-store on every state change. */
    function handleStoreChange(): void {
      pendingStateRef.current = extractPersisted(getSnapshot());

      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        if (pendingStateRef.current !== null) {
          const state = pendingStateRef.current;
          pendingStateRef.current = null;
          void putUiState(projectId, state);
        }
      }, DEBOUNCE_MS);
    }

    const unsubscribe = subscribe(handleStoreChange);

    window.addEventListener('beforeunload', flushPending);

    return () => {
      unsubscribe();
      window.removeEventListener('beforeunload', flushPending);
      // Cancel any in-flight debounce on cleanup; do NOT flush here — the
      // project may be switching (not unloading) so we avoid a spurious PUT.
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      pendingStateRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, isProjectReady]);
}
