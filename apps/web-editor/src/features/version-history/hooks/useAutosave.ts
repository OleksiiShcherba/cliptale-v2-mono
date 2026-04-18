import { useEffect, useRef, useCallback, useState } from 'react';

import {
  getSnapshot,
  subscribe as subscribeToProject,
  setCurrentVersionId,
  getCurrentVersionId,
} from '@/store/project-store';
import { drainPatches, hasPendingPatches } from '@/store/history-store';
import { saveVersion, fetchLatestVersion } from '@/features/version-history/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'conflict';

export type UseAutosaveResult = {
  saveStatus: SaveStatus;
  lastSavedAt: Date | null;
  hasEverEdited: boolean;
  /** Triggers an immediate save without waiting for the debounce timer. */
  save: () => Promise<void>;
  /**
   * Resolves a conflict by fetching the latest server version, updating the
   * local parent pointer, and retrying the save. If the retry still conflicts,
   * the status stays on `'conflict'` — no infinite retry.
   */
  resolveConflictByOverwrite: () => Promise<void>;
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
 * - On 409 conflict: sets `saveStatus` to `'conflict'`.
 * - Exposes `save()` for a manual immediate save trigger.
 * - Exposes `resolveConflictByOverwrite()` to resolve a conflict by fetching
 *   the latest version, updating the parent pointer, and retrying save.
 * - Adds a `beforeunload` listener to attempt an immediate flush on tab close.
 * - Exposes `saveStatus` and `lastSavedAt` for the header indicator.
 */
export function useAutosave(projectId: string): UseAutosaveResult {
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
  // Core save function — not debounced; called by the timer, beforeunload, and
  // the manual save trigger.
  // When `force` is true the hasPendingPatches guard is bypassed so the overwrite
  // path can POST the current snapshot even after patches were already drained by
  // the failed optimistic-lock attempt.
  // ---------------------------------------------------------------------------

  const performSave = useCallback(async (force = false): Promise<void> => {
    if (isSavingRef.current) return;
    if (!force && !hasPendingPatches()) return;

    isSavingRef.current = true;
    setSaveStatus('saving');

    const doc = getSnapshot();
    const { patches, inversePatches } = drainPatches();
    const parentVersionId = getCurrentVersionId();

    try {
      const result = await saveVersion(projectId, {
        docJson: doc,
        docSchemaVersion: doc.schemaVersion,
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
  }, [projectId]);

  // ---------------------------------------------------------------------------
  // Manual save trigger — bypasses the debounce, called from the Save button.
  // ---------------------------------------------------------------------------

  const save = useCallback(async (): Promise<void> => {
    return performSave();
  }, [performSave]);

  // ---------------------------------------------------------------------------
  // Overwrite conflict — fetches latest versionId, updates the parent pointer,
  // and retries the save from the current snapshot without re-queuing patches.
  // If the retry still 409s, status remains 'conflict' (no infinite retry).
  // ---------------------------------------------------------------------------

  const resolveConflictByOverwrite = useCallback(async (): Promise<void> => {
    try {
      const latest = await fetchLatestVersion(projectId);
      setCurrentVersionId(latest.versionId);
    } catch {
      // If we cannot fetch the latest version, keep the conflict state.
      return;
    }

    // Force-save from the current snapshot even if patch buffer is empty after
    // the previous failed attempt already drained it.
    await performSave(true);
  }, [projectId, performSave]);

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

  return { saveStatus, lastSavedAt, hasEverEdited, save, resolveConflictByOverwrite };
}
