import { useEffect, useRef, useCallback, useState } from 'react';

import {
  getSnapshot,
  subscribe as subscribeToProject,
  setCurrentVersionId,
  getCurrentVersionId,
} from '@/store/project-store';
import { drainPatches, hasPendingPatches } from '@/store/history-store';
import { saveVersion } from '@/features/version-history/api';
import { DEV_PROJECT_ID } from '@/lib/constants';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'conflict';

export type UseAutosaveResult = {
  saveStatus: SaveStatus;
  lastSavedAt: Date | null;
  hasEverEdited: boolean;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Debounce delay in ms before triggering an autosave after the last change. */
const DEBOUNCE_MS = 2000;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Subscribes to project-store changes and debounces writes to the version API.
 *
 * - Debounces 2 s after the last `setProject` call.
 * - On save, drains accumulated patches from history-store and POSTs the full
 *   doc + patches to `POST /projects/:id/versions`.
 * - On 409 conflict: sets `saveStatus` to `'conflict'` (sticky — requires reload).
 * - Adds a `beforeunload` listener to attempt an immediate flush on tab close.
 * - Exposes `saveStatus` and `lastSavedAt` for the header indicator.
 */
export function useAutosave(): UseAutosaveResult {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [hasEverEdited, setHasEverEdited] = useState(false);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSavingRef = useRef(false);
  // Ref-copy of saveStatus so the subscription closure always reads the latest value
  // without the effect needing to re-subscribe on every status change.
  const saveStatusRef = useRef<SaveStatus>('idle');

  useEffect(() => {
    saveStatusRef.current = saveStatus;
  }, [saveStatus]);

  // ---------------------------------------------------------------------------
  // Core save function — not debounced; called by both the timer and beforeunload
  // ---------------------------------------------------------------------------

  const performSave = useCallback(async (): Promise<void> => {
    if (isSavingRef.current) return;
    if (!hasPendingPatches()) return;

    isSavingRef.current = true;
    setSaveStatus('saving');

    const doc = getSnapshot();
    const { patches, inversePatches } = drainPatches();
    const parentVersionId = getCurrentVersionId();

    try {
      const result = await saveVersion(DEV_PROJECT_ID, {
        doc_json: doc,
        patches,
        inversePatches,
        parentVersionId,
      });

      setCurrentVersionId(result.versionId);
      setLastSavedAt(new Date(result.createdAt));
      setSaveStatus('saved');
    } catch (err: unknown) {
      const maybeStatus = (err as Error & { status?: number }).status;
      if (maybeStatus === 409) {
        setSaveStatus('conflict');
      } else {
        // Non-conflict error: revert to idle so the next change can retry.
        setSaveStatus('idle');
      }
    } finally {
      isSavingRef.current = false;
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Project-store subscription + debounce
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const unsubscribe = subscribeToProject(() => {
      // Conflict state is sticky — user must reload to clear it.
      if (saveStatusRef.current === 'conflict') return;

      setHasEverEdited(true);

      // Reset any pending timer and start a new debounce window.
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        void performSave();
      }, DEBOUNCE_MS);
    });

    return () => {
      unsubscribe();
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [performSave]);

  // ---------------------------------------------------------------------------
  // beforeunload — attempt immediate flush on tab close
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const handleBeforeUnload = (): void => {
      void performSave();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [performSave]);

  return { saveStatus, lastSavedAt, hasEverEdited };
}
