/**
 * T19 — useFlowAutosave
 *
 * Debounced autosave for the Generate AI Flow canvas with optimistic locking
 * (AC-10b). Carries the current local version to saveCanvas; bumps the version
 * on success; surfaces a conflict warning on 409 so the Creator can reload.
 * The first save stays authoritative — no silent overwrite.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import type { FlowCanvas } from '@ai-video-editor/project-schema';

import { saveCanvas } from '../api';

// ── Constants ──────────────────────────────────────────────────────────────────

/** Debounce window in ms — keeps autosave ack target ≤ 800 ms (AC-10b). */
const DEBOUNCE_MS = 600;

// ── Types ──────────────────────────────────────────────────────────────────────

export type AutosaveStatus = 'idle' | 'saving' | 'saved';

export type UseFlowAutosaveOptions = {
  /** The flow being saved. */
  flowId: string;
  /**
   * The version from the server (from the initial load or the last successful
   * save). The hook maintains its own local copy and bumps it on success.
   */
  version: number;
  /** The current canvas document. Whenever this reference changes the debounce
   * timer is (re-)armed. */
  canvas: FlowCanvas;
};

export type UseFlowAutosaveResult = {
  /** Current autosave status. */
  status: AutosaveStatus;
  /** The locally-tracked version (bumped after each successful save). */
  localVersion: number;
  /**
   * True when a 409 conflict was detected — the Creator must reload to recover.
   * No further saves will be attempted while this is true.
   */
  conflict: boolean;
};

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useFlowAutosave({
  flowId,
  version,
  canvas,
}: UseFlowAutosaveOptions): UseFlowAutosaveResult {
  // The locally-tracked version starts from the prop and is bumped after every
  // successful save. We keep it in a ref for the save function closure and expose
  // it as state so callers can read the current value reactively.
  const [localVersion, setLocalVersion] = useState<number>(version);
  const localVersionRef = useRef<number>(version);

  // Sync localVersionRef when state updates (keeps the closure fresh).
  useEffect(() => {
    localVersionRef.current = localVersion;
  }, [localVersion]);

  const [status, setStatus] = useState<AutosaveStatus>('idle');
  const [conflict, setConflict] = useState<boolean>(false);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSavingRef = useRef<boolean>(false);
  const conflictRef = useRef<boolean>(false);
  // The first canvas the hook ever sees is the loaded document, not an edit — never
  // autosave it (that would spuriously bump the optimistic-lock version on load).
  // Track it by REFERENCE (not a boolean flag) so React StrictMode's double-invoked
  // mount effect can't slip a save through after a one-shot flag was already cleared.
  const initialCanvasRef = useRef<FlowCanvas>(canvas);

  // Keep conflictRef in sync.
  useEffect(() => {
    conflictRef.current = conflict;
  }, [conflict]);

  // Mutable ref so the save closure always reads the latest canvas without
  // needing to be recreated on every canvas change.
  const canvasRef = useRef<FlowCanvas>(canvas);
  const flowIdRef = useRef<string>(flowId);

  useEffect(() => {
    canvasRef.current = canvas;
  }, [canvas]);

  useEffect(() => {
    flowIdRef.current = flowId;
  }, [flowId]);

  // ── Core save ────────────────────────────────────────────────────────────────

  const performSave = useCallback(async (): Promise<void> => {
    // Guard: never attempt a save while in conflict — the first save is
    // authoritative and the Creator must reload (AC-10b).
    if (conflictRef.current) return;
    if (isSavingRef.current) return;

    isSavingRef.current = true;
    setStatus('saving');

    const currentFlowId = flowIdRef.current;
    const currentCanvas = canvasRef.current;
    const parentVersion = localVersionRef.current;

    try {
      const result = await saveCanvas(currentFlowId, {
        version: parentVersion,
        canvas: currentCanvas,
      });
      // Bump the local version to the server-returned version.
      localVersionRef.current = result.version;
      setLocalVersion(result.version);
      setStatus('saved');
    } catch (err: unknown) {
      const status409 =
        typeof err === 'object' &&
        err !== null &&
        'status' in err &&
        (err as { status: unknown }).status === 409;

      if (status409) {
        // First save wins — surface a conflict warning; stop retrying.
        setConflict(true);
        conflictRef.current = true;
      }
      setStatus('idle');
    } finally {
      isSavingRef.current = false;
    }
  }, []);

  // ── Debounce on canvas changes ────────────────────────────────────────────────

  useEffect(() => {
    // Skip the initial canvas (the loaded document) — only edits autosave. Compared by
    // reference so a StrictMode re-run of the mount effect still skips it.
    if (canvas === initialCanvasRef.current) return;
    // Never save if a conflict has been detected.
    if (conflictRef.current) return;

    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      void performSave();
    }, DEBOUNCE_MS);

    return () => {
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvas]);

  return { status, localVersion, conflict };
}
