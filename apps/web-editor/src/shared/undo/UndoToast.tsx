import React from 'react';

import type { UndoToastState } from './useUndoToast';
import { undoToastStyles as styles } from './undoToast.styles';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface UndoToastProps {
  /** Current toast visibility / data from `useUndoToast`. */
  toastState: UndoToastState;
  /** Dismiss the toast without performing the undo action. */
  onDismiss: () => void;
  /** Perform the undo action and dismiss the toast. */
  onUndo: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// UndoToast
// ---------------------------------------------------------------------------

/**
 * Renders a fixed-position bottom-center toast that offers an "Undo" action
 * after a soft-delete. Controlled entirely through `toastState` from the
 * `useUndoToast` hook.
 *
 * Only one toast is shown at a time (single-toast queue — the hook enforces
 * this). Auto-dismiss after 5s is also managed by the hook; this component
 * is purely presentational.
 */
export function UndoToast({ toastState, onDismiss, onUndo }: UndoToastProps): React.ReactElement | null {
  const [isUndoing, setIsUndoing] = React.useState(false);

  if (!toastState.visible) return null;

  const { label } = toastState.entry;

  async function handleUndo(): Promise<void> {
    if (isUndoing) return;
    setIsUndoing(true);
    try {
      await onUndo();
    } finally {
      setIsUndoing(false);
    }
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Undo: ${label}`}
      style={styles.container}
    >
      <p style={styles.label} title={label}>
        {label}
      </p>
      <button
        type="button"
        style={styles.undoButton}
        onClick={() => { void handleUndo(); }}
        disabled={isUndoing}
        aria-label="Undo last action"
      >
        {isUndoing ? 'Undoing…' : 'Undo'}
      </button>
      <button
        type="button"
        style={styles.dismissButton}
        onClick={onDismiss}
        disabled={isUndoing}
        aria-label="Dismiss notification"
      >
        ✕
      </button>
    </div>
  );
}
