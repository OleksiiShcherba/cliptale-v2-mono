/**
 * useDismissableFlag — 4 test cases.
 *
 * 1. Absent flag → dismissed=false on mount.
 * 2. Existing 'dismissed' flag → dismissed=true on mount.
 * 3. Calling dismiss() writes the sentinel to localStorage and flips dismissed=true.
 * 4. Key isolation — two hooks with different keys don't interfere.
 */

import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { useDismissableFlag } from './useDismissableFlag';

// ---------------------------------------------------------------------------
// Setup: use real localStorage (jsdom provides a working implementation).
// ---------------------------------------------------------------------------

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useDismissableFlag', () => {
  // -------------------------------------------------------------------------
  // Case 1 — absent flag → dismissed=false
  // -------------------------------------------------------------------------

  it('returns dismissed=false when the key is absent from localStorage', () => {
    const { result } = renderHook(() => useDismissableFlag('test:case1'));

    expect(result.current.dismissed).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Case 2 — existing 'dismissed' flag → dismissed=true on mount
  // -------------------------------------------------------------------------

  it('returns dismissed=true when localStorage already contains the dismissed sentinel', () => {
    window.localStorage.setItem('test:case2', 'dismissed');

    const { result } = renderHook(() => useDismissableFlag('test:case2'));

    expect(result.current.dismissed).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Case 3 — calling dismiss() writes the sentinel and flips state
  // -------------------------------------------------------------------------

  it('writes "dismissed" to localStorage and sets dismissed=true when dismiss() is called', () => {
    const { result } = renderHook(() => useDismissableFlag('test:case3'));

    expect(result.current.dismissed).toBe(false);

    act(() => {
      result.current.dismiss();
    });

    expect(result.current.dismissed).toBe(true);
    expect(window.localStorage.getItem('test:case3')).toBe('dismissed');
  });

  // -------------------------------------------------------------------------
  // Case 4 — key isolation (two hooks with different keys don't interfere)
  // -------------------------------------------------------------------------

  it('does not interfere when two hooks use different keys', () => {
    window.localStorage.setItem('test:keyA', 'dismissed');

    const hookA = renderHook(() => useDismissableFlag('test:keyA'));
    const hookB = renderHook(() => useDismissableFlag('test:keyB'));

    // Key A is pre-dismissed; key B is absent.
    expect(hookA.result.current.dismissed).toBe(true);
    expect(hookB.result.current.dismissed).toBe(false);

    // Dismissing B must not affect A.
    act(() => {
      hookB.result.current.dismiss();
    });

    expect(hookA.result.current.dismissed).toBe(true);
    expect(hookB.result.current.dismissed).toBe(true);
    expect(window.localStorage.getItem('test:keyA')).toBe('dismissed');
    expect(window.localStorage.getItem('test:keyB')).toBe('dismissed');
  });
});
