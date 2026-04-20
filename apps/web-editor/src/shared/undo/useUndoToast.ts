import { useState, useRef, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UndoToastEntry = {
  /** Unique id for the toast — used as React key. */
  id: string;
  /** Human-readable label shown in the toast body. */
  label: string;
  /** Called when the user clicks "Undo". */
  onUndo: () => Promise<void>;
};

export type UndoToastState =
  | { visible: false }
  | { visible: true; entry: UndoToastEntry };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Duration (ms) before the undo toast auto-dismisses. */
const AUTO_DISMISS_MS = 5_000;

// ---------------------------------------------------------------------------
// useUndoToast
// ---------------------------------------------------------------------------

/**
 * Manages the single-toast undo queue.
 *
 * Rules:
 * - Only one toast is visible at a time. Calling `showToast` while another
 *   is visible dismisses the old one first (without calling its onUndo).
 * - The toast auto-dismisses after `AUTO_DISMISS_MS` milliseconds.
 * - Clicking "Undo" invokes `entry.onUndo()` then hides the toast.
 * - Dismissal (timeout or manual) does NOT trigger a hard-delete — that is
 *   handled by a separate scheduled concern outside this batch.
 */
export function useUndoToast(): {
  toastState: UndoToastState;
  showToast: (entry: Omit<UndoToastEntry, 'id'>) => void;
  dismissToast: () => void;
  handleUndo: () => Promise<void>;
} {

  const [toastState, setToastState] = useState<UndoToastState>({ visible: false });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Clear any existing auto-dismiss timer. */
  const clearTimer = useCallback((): void => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const dismissToast = useCallback((): void => {
    clearTimer();
    setToastState({ visible: false });
  }, [clearTimer]);

  const showToast = useCallback(
    (entry: Omit<UndoToastEntry, 'id'>): void => {
      // Dismiss any currently-visible toast before showing the new one (single-toast queue).
      clearTimer();
      const id = `undo-${Date.now()}`;
      setToastState({ visible: true, entry: { ...entry, id } });

      timerRef.current = setTimeout(() => {
        setToastState({ visible: false });
        timerRef.current = null;
      }, AUTO_DISMISS_MS);
    },
    [clearTimer],
  );

  const handleUndo = useCallback(async (): Promise<void> => {
    if (!toastState.visible) return;
    const { onUndo } = toastState.entry;
    dismissToast();
    await onUndo();
  }, [toastState, dismissToast]);

  return { toastState, showToast, dismissToast, handleUndo };
}
