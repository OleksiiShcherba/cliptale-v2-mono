/**
 * Debounced autosave hook for the generation-wizard Step 1 draft.
 *
 * Lifecycle:
 *   - When `initialDraftId` is provided, the hook fetches the existing draft on
 *     mount, hydrates editor state from `draft.promptDoc`, and wires `draftId`
 *     so all subsequent autosaves PUT against that id (no new draft row created).
 *     On 404 / 403 the error is logged at `console.warn` and the hook falls
 *     through to the normal fresh-start flow transparently.
 *   - When no `initialDraftId` is given (fresh-start), the first `setDoc` call
 *     triggers POST /generation-drafts after an 800 ms debounce window and
 *     stores the returned id in `draftId`.
 *   - Every subsequent `setDoc` call is debounced 800 ms; on fire, it PUTs the
 *     latest doc to PUT /generation-drafts/:draftId.
 *   - `flush()` cancels the pending timer and immediately performs the save.
 *   - On failure the request is retried once; if the retry also fails, `status`
 *     becomes 'error' and no further automatic retries occur.
 *   - The debounce timer is cleared on unmount to prevent setState-after-unmount.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { useMutation } from '@tanstack/react-query';

import { createDraft, fetchDraft, updateDraft } from '@/features/generate-wizard/api';

import type { PromptDoc, SaveStatus } from '@/features/generate-wizard/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Debounce delay in ms before triggering an autosave after the last change. */
const DEBOUNCE_MS = 800;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type UseGenerationDraftOptions = {
  /**
   * Optional starting PromptDoc.
   * Ignored when `initialDraftId` is given and the fetch succeeds.
   */
  initial?: PromptDoc;
  /**
   * When present, the hook hydrates from the existing draft instead of
   * starting a fresh create flow.
   */
  initialDraftId?: string | null;
};

export type UseGenerationDraftResult = {
  draftId: string | null;
  doc: PromptDoc;
  setDoc: (next: PromptDoc) => void;
  status: SaveStatus;
  lastSavedAt: Date | null;
  flush: () => Promise<void>;
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/** Default empty document used when no initial content is provided. */
const DEFAULT_DOC: PromptDoc = { schemaVersion: 1, blocks: [{ type: 'text', value: '' }] };

/**
 * Manages the in-progress generation draft with debounced server persistence.
 *
 * @param options - Optional `initial` PromptDoc and/or `initialDraftId` for
 *   the resume-draft (hydrate) flow.
 */
export function useGenerationDraft(options: UseGenerationDraftOptions = {}): UseGenerationDraftResult {
  const { initial, initialDraftId } = options;

  const initialDoc: PromptDoc = initial ?? DEFAULT_DOC;

  const [doc, setDocState] = useState<PromptDoc>(initialDoc);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  // Stable refs so async callbacks always see current values without closures
  // capturing stale state.
  const draftIdRef = useRef<string | null>(null);
  const latestDocRef = useRef<PromptDoc>(initialDoc);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  // Keep draftIdRef in sync with state — state drives rendering, ref drives
  // async callbacks.
  useEffect(() => {
    draftIdRef.current = draftId;
  }, [draftId]);

  // Mark unmounted so we never call setState after the component is gone.
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      // Cancel any pending debounce on unmount.
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Hydrate branch — runs once on mount when initialDraftId is provided.
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!initialDraftId) return;

    let cancelled = false;

    fetchDraft(initialDraftId)
      .then((draft) => {
        if (cancelled || !isMountedRef.current) return;
        // Hydrate both the React state and the stable ref.
        latestDocRef.current = draft.promptDoc;
        setDocState(draft.promptDoc);
        setDraftId(draft.id);
        draftIdRef.current = draft.id;
      })
      .catch((err: unknown) => {
        // 404 / 403 / network error — fall through to fresh-start silently.
        console.warn('[useGenerationDraft] hydrate failed; starting fresh.', err);
      });

    return () => {
      cancelled = true;
    };
    // Only run on mount; initialDraftId is derived from a stable URL param.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDraftId]);

  // ---------------------------------------------------------------------------
  // Mutations (React Query)
  // ---------------------------------------------------------------------------

  const createMutation = useMutation({
    mutationFn: (promptDoc: PromptDoc) => createDraft(promptDoc),
    // Disable React Query's own retry — we manage retry manually below.
    retry: false,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, promptDoc }: { id: string; promptDoc: PromptDoc }) =>
      updateDraft(id, promptDoc),
    retry: false,
  });

  // ---------------------------------------------------------------------------
  // Core save — performs the create or update, with one automatic retry.
  // ---------------------------------------------------------------------------

  const performSave = useCallback(async (): Promise<void> => {
    if (!isMountedRef.current) return;

    const docToSave = latestDocRef.current;
    const currentDraftId = draftIdRef.current;

    if (isMountedRef.current) setStatus('saving');

    const attemptSave = async (): Promise<void> => {
      if (currentDraftId === null) {
        // No draft yet — create one.
        const draft = await createMutation.mutateAsync(docToSave);
        if (isMountedRef.current) {
          setDraftId(draft.id);
          draftIdRef.current = draft.id;
        }
      } else {
        // Draft exists (either from hydrate or prior create) — update it.
        await updateMutation.mutateAsync({ id: currentDraftId, promptDoc: docToSave });
      }
    };

    try {
      await attemptSave();
      if (isMountedRef.current) {
        setStatus('saved');
        setLastSavedAt(new Date());
      }
    } catch {
      // First attempt failed — retry once.
      try {
        await attemptSave();
        if (isMountedRef.current) {
          setStatus('saved');
          setLastSavedAt(new Date());
        }
      } catch {
        if (isMountedRef.current) {
          setStatus('error');
        }
      }
    }
  }, [createMutation, updateMutation]);

  // ---------------------------------------------------------------------------
  // setDoc — public setter that also schedules the debounced save.
  // ---------------------------------------------------------------------------

  const setDoc = useCallback(
    (next: PromptDoc): void => {
      // No-op when the doc content has not changed.
      if (JSON.stringify(next) === JSON.stringify(latestDocRef.current)) return;

      latestDocRef.current = next;
      setDocState(next);

      // Reset any pending timer and start a fresh 800 ms window.
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        void performSave();
      }, DEBOUNCE_MS);
    },
    [performSave],
  );

  // ---------------------------------------------------------------------------
  // flush — cancels pending debounce and saves immediately.
  // ---------------------------------------------------------------------------

  const flush = useCallback(async (): Promise<void> => {
    // If there is no pending timer, there's nothing queued — return immediately.
    if (debounceTimerRef.current === null) return;

    clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = null;

    await performSave();
  }, [performSave]);

  // ---------------------------------------------------------------------------

  return { draftId, doc, setDoc, status, lastSavedAt, flush };
}
