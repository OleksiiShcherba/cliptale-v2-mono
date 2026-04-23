/**
 * Tests for useStoryboardAutosave.
 *
 * Covers:
 * - Calls PUT /storyboards/:draftId after 30s debounce when state has changed.
 * - Does NOT call the API again if state has not changed since last save.
 * - saveLabel shows "—" on initial render, "Saving…" during save, "Saved just now" after save.
 * - beforeunload listener is registered and removed on unmount.
 * - Multiple store-change events within 30s collapse into a single API call.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ── Mocks ──────────────────────────────────────────────────────────────────────

// We need hoisted mocks for the module-level store callback.
const { mockSubscribeCallback } = vi.hoisted(() => ({
  mockSubscribeCallback: { current: null as (() => void) | null },
}));

vi.mock('../api', () => ({
  saveStoryboard: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../store/storyboard-store', () => ({
  subscribe: vi.fn((cb: () => void) => {
    mockSubscribeCallback.current = cb;
    return () => {
      mockSubscribeCallback.current = null;
    };
  }),
  getSnapshot: vi.fn().mockReturnValue({
    nodes: [
      {
        id: 'start',
        type: 'start',
        position: { x: 60, y: 200 },
        data: { label: 'START' },
      },
    ],
    edges: [],
    positions: { start: { x: 60, y: 200 } },
  }),
}));

import { useStoryboardAutosave } from './useStoryboardAutosave';
import { saveStoryboard } from '../api';

// ── Setup / teardown ───────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(saveStoryboard).mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  mockSubscribeCallback.current = null;
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('useStoryboardAutosave', () => {
  describe('initial state', () => {
    it('returns saveLabel "—" before any save', () => {
      const { result } = renderHook(() => useStoryboardAutosave('draft-1'));
      expect(result.current.saveLabel).toBe('—');
    });

    it('does NOT call saveStoryboard on mount', () => {
      renderHook(() => useStoryboardAutosave('draft-1'));
      vi.advanceTimersByTime(30_001);
      // No store change was fired — no save expected.
      expect(saveStoryboard).not.toHaveBeenCalled();
    });
  });

  describe('debounced save after state change', () => {
    it('calls saveStoryboard once after 30s when the store emits a change', async () => {
      renderHook(() => useStoryboardAutosave('draft-1'));

      // Simulate a store mutation.
      act(() => {
        mockSubscribeCallback.current?.();
      });

      // Not yet called — debounce hasn't fired.
      expect(saveStoryboard).not.toHaveBeenCalled();

      // Advance timers past the 30s debounce.
      await act(async () => {
        vi.advanceTimersByTime(30_001);
        // Flush pending microtasks from the async save.
        await Promise.resolve();
      });

      expect(saveStoryboard).toHaveBeenCalledTimes(1);
      expect(saveStoryboard).toHaveBeenCalledWith('draft-1', expect.any(Object));
    });

    it('collapses multiple changes within 30s into a single API call', async () => {
      renderHook(() => useStoryboardAutosave('draft-1'));

      // Fire store changes rapidly.
      act(() => {
        mockSubscribeCallback.current?.();
        mockSubscribeCallback.current?.();
        mockSubscribeCallback.current?.();
      });

      await act(async () => {
        vi.advanceTimersByTime(30_001);
        await Promise.resolve();
      });

      // Should be called exactly once despite three rapid emissions.
      expect(saveStoryboard).toHaveBeenCalledTimes(1);
    });

    it('does NOT call saveStoryboard again if state has not changed since last save', async () => {
      renderHook(() => useStoryboardAutosave('draft-1'));

      // First change → first save.
      act(() => {
        mockSubscribeCallback.current?.();
      });
      await act(async () => {
        vi.advanceTimersByTime(30_001);
        await Promise.resolve();
      });
      expect(saveStoryboard).toHaveBeenCalledTimes(1);

      // Second change → debounce fires again but state key is the same (mock getSnapshot
      // always returns the same value) → no additional API call.
      act(() => {
        mockSubscribeCallback.current?.();
      });
      await act(async () => {
        vi.advanceTimersByTime(30_001);
        await Promise.resolve();
      });

      // Still only one call because the stateKey didn't change.
      expect(saveStoryboard).toHaveBeenCalledTimes(1);
    });
  });

  describe('saveLabel updates', () => {
    it('shows "Saving…" during an in-progress save', async () => {
      // Make saveStoryboard never resolve so we can observe the "Saving…" state.
      vi.mocked(saveStoryboard).mockImplementation(() => new Promise(() => undefined));

      const { result } = renderHook(() => useStoryboardAutosave('draft-1'));

      act(() => {
        mockSubscribeCallback.current?.();
      });

      await act(async () => {
        vi.advanceTimersByTime(30_001);
        // Flush the setState('saving') call.
        await Promise.resolve();
      });

      expect(result.current.saveLabel).toBe('Saving…');
    });

    it('shows "Saved just now" immediately after a successful save', async () => {
      const { result } = renderHook(() => useStoryboardAutosave('draft-1'));

      act(() => {
        mockSubscribeCallback.current?.();
      });

      await act(async () => {
        vi.advanceTimersByTime(30_001);
        await Promise.resolve();
        await Promise.resolve(); // additional flush for state updates
      });

      expect(result.current.saveLabel).toBe('Saved just now');
    });
  });

  describe('saveNow', () => {
    it('triggers an immediate save bypassing the debounce timer', async () => {
      const { result } = renderHook(() => useStoryboardAutosave('draft-1'));

      act(() => {
        mockSubscribeCallback.current?.();
      });

      // Call saveNow immediately without advancing the debounce timer.
      await act(async () => {
        await result.current.saveNow();
      });

      expect(saveStoryboard).toHaveBeenCalledTimes(1);
    });
  });

  describe('beforeunload listener', () => {
    it('registers a beforeunload listener on mount', () => {
      const addSpy = vi.spyOn(window, 'addEventListener');
      renderHook(() => useStoryboardAutosave('draft-1'));
      expect(addSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));
      vi.restoreAllMocks();
    });

    it('removes the beforeunload listener on unmount', () => {
      const removeSpy = vi.spyOn(window, 'removeEventListener');
      const { unmount } = renderHook(() => useStoryboardAutosave('draft-1'));
      unmount();
      expect(removeSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));
      vi.restoreAllMocks();
    });
  });
});
