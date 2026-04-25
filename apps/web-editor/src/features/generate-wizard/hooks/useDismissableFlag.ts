/**
 * useDismissableFlag — localStorage-backed boolean flag with dismiss action.
 *
 * Reads a key from localStorage on mount (SSR-safe: guarded with `typeof window`).
 * The flag is considered dismissed when the stored value equals `'dismissed'`.
 * Calling `dismiss()` writes that sentinel value and updates the in-memory state.
 *
 * §5: localStorage logic lives here, not in the component.
 */

import { useState, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** The sentinel value stored in localStorage to mark a flag as dismissed. */
const DISMISSED_VALUE = 'dismissed';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UseDismissableFlagResult = {
  /** `true` when the flag has been dismissed (i.e. localStorage value === 'dismissed'). */
  dismissed: boolean;
  /** Writes the dismissed sentinel to localStorage and sets dismissed=true. */
  dismiss: () => void;
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Manages a dismissable boolean flag backed by localStorage.
 *
 * @param key - The localStorage key to read/write (e.g. `'proTip:generateStep1'`).
 */
export function useDismissableFlag(key: string): UseDismissableFlagResult {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    // SSR-safe guard: window is not available in Node/SSR environments.
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(key) === DISMISSED_VALUE;
  });

  const dismiss = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(key, DISMISSED_VALUE);
    }
    setDismissed(true);
  }, [key]);

  return { dismissed, dismiss };
}
