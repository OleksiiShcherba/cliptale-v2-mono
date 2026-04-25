import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { useUndoToast } from './useUndoToast';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(overrides: Partial<{ label: string; onUndo: () => Promise<void> }> = {}) {
  return {
    label: 'Asset deleted',
    onUndo: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useUndoToast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runAllTimers();
    vi.useRealTimers();
  });

  describe('initial state', () => {
    it('starts with visible: false', () => {
      const { result } = renderHook(() => useUndoToast());
      expect(result.current.toastState.visible).toBe(false);
    });
  });

  describe('showToast', () => {
    it('sets visible: true with the provided entry', () => {
      const { result } = renderHook(() => useUndoToast());
      const entry = makeEntry({ label: 'File deleted' });
      act(() => { result.current.showToast(entry); });
      expect(result.current.toastState.visible).toBe(true);
      if (result.current.toastState.visible) {
        expect(result.current.toastState.entry.label).toBe('File deleted');
      }
    });

    it('assigns a unique id to each toast', () => {
      const { result } = renderHook(() => useUndoToast());
      act(() => { result.current.showToast(makeEntry()); });
      const firstId = result.current.toastState.visible ? result.current.toastState.entry.id : null;
      // Advance time so Date.now() differs
      act(() => { vi.advanceTimersByTime(2); });
      act(() => { result.current.showToast(makeEntry()); });
      const secondId = result.current.toastState.visible ? result.current.toastState.entry.id : null;
      expect(firstId).not.toBeNull();
      expect(secondId).not.toBeNull();
      expect(firstId).not.toBe(secondId);
    });
  });

  describe('auto-dismiss after 5s', () => {
    it('auto-dismisses the toast after 5000ms', () => {
      const { result } = renderHook(() => useUndoToast());
      act(() => { result.current.showToast(makeEntry()); });
      expect(result.current.toastState.visible).toBe(true);
      act(() => { vi.advanceTimersByTime(5_000); });
      expect(result.current.toastState.visible).toBe(false);
    });

    it('does not dismiss before 5000ms have elapsed', () => {
      const { result } = renderHook(() => useUndoToast());
      act(() => { result.current.showToast(makeEntry()); });
      act(() => { vi.advanceTimersByTime(4_999); });
      expect(result.current.toastState.visible).toBe(true);
    });
  });

  describe('single-toast queue', () => {
    it('replaces an existing toast when showToast is called again', () => {
      const { result } = renderHook(() => useUndoToast());
      act(() => { result.current.showToast(makeEntry({ label: 'First toast' })); });
      act(() => { result.current.showToast(makeEntry({ label: 'Second toast' })); });
      expect(result.current.toastState.visible).toBe(true);
      if (result.current.toastState.visible) {
        expect(result.current.toastState.entry.label).toBe('Second toast');
      }
    });

    it('resets the 5s timer when a new toast replaces the old one', () => {
      const { result } = renderHook(() => useUndoToast());
      act(() => { result.current.showToast(makeEntry({ label: 'First' })); });
      // Advance 3s — still visible
      act(() => { vi.advanceTimersByTime(3_000); });
      expect(result.current.toastState.visible).toBe(true);
      // New toast shown — timer should restart
      act(() => { result.current.showToast(makeEntry({ label: 'Second' })); });
      // Advance another 3s (6s total from first, only 3s from second)
      act(() => { vi.advanceTimersByTime(3_000); });
      // Still visible because the second toast timer hasn't expired yet
      expect(result.current.toastState.visible).toBe(true);
      // Advance the remaining 2s — second toast expires
      act(() => { vi.advanceTimersByTime(2_000); });
      expect(result.current.toastState.visible).toBe(false);
    });
  });

  describe('dismissToast', () => {
    it('hides the toast immediately', () => {
      const { result } = renderHook(() => useUndoToast());
      act(() => { result.current.showToast(makeEntry()); });
      act(() => { result.current.dismissToast(); });
      expect(result.current.toastState.visible).toBe(false);
    });

    it('cancels the auto-dismiss timer', () => {
      const { result } = renderHook(() => useUndoToast());
      act(() => { result.current.showToast(makeEntry()); });
      act(() => { result.current.dismissToast(); });
      // No error should occur when the timer fires after manual dismiss
      act(() => { vi.advanceTimersByTime(5_000); });
      expect(result.current.toastState.visible).toBe(false);
    });
  });

  describe('handleUndo', () => {
    it('calls entry.onUndo and dismisses the toast', async () => {
      const onUndo = vi.fn().mockResolvedValue(undefined);
      const { result } = renderHook(() => useUndoToast());
      act(() => { result.current.showToast(makeEntry({ onUndo })); });
      await act(async () => { await result.current.handleUndo(); });
      expect(onUndo).toHaveBeenCalledOnce();
      expect(result.current.toastState.visible).toBe(false);
    });

    it('is a no-op when toast is not visible', async () => {
      const { result } = renderHook(() => useUndoToast());
      // Should not throw
      await act(async () => { await result.current.handleUndo(); });
      expect(result.current.toastState.visible).toBe(false);
    });
  });
});
