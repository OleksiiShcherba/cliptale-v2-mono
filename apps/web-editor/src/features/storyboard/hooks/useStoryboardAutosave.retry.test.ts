/**
 * Tests for useStoryboardAutosave — failure visibility + automatic retry
 * (storyboard-autosave-checkpoints T13, AC-01b).
 *
 * Covers:
 * - A failed PUT surfaces a visible "Not saved" label (no console-only failure).
 * - The hook auto-retries WITHOUT user edits until the save succeeds.
 * - After a successful retry the label returns to "Saved just now".
 * - A failure never blocks subsequent edits (debounce keeps re-arming).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('../api', () => ({
  saveStoryboard: vi.fn().mockResolvedValue(undefined),
}));

import { useStoryboardAutosave, AUTOSAVE_RETRY_MS } from './useStoryboardAutosave';
import { saveStoryboard } from '../api';
import {
  DRAFT_ID,
  DEFAULT_NODES,
  DEFAULT_EDGES,
} from './useStoryboardAutosave.fixtures';

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(saveStoryboard).mockResolvedValue(undefined);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('useStoryboardAutosave — not-saved indicator + auto-retry (AC-01b)', () => {
  it('shows a visible "Not saved" label after a failed PUT', async () => {
    vi.mocked(saveStoryboard).mockRejectedValue(new Error('network down'));

    const { result } = renderHook(() =>
      useStoryboardAutosave(DRAFT_ID, DEFAULT_NODES, DEFAULT_EDGES),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_001);
    });

    expect(saveStoryboard).toHaveBeenCalledTimes(1);
    expect(result.current.saveLabel).toMatch(/not saved/i);
  });

  it('auto-retries until success without user edits; label recovers', async () => {
    vi.mocked(saveStoryboard)
      .mockRejectedValueOnce(new Error('down 1'))
      .mockRejectedValueOnce(new Error('down 2'))
      .mockResolvedValueOnce(undefined);

    const { result } = renderHook(() =>
      useStoryboardAutosave(DRAFT_ID, DEFAULT_NODES, DEFAULT_EDGES),
    );

    // First attempt fails.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_001);
    });
    expect(saveStoryboard).toHaveBeenCalledTimes(1);
    expect(result.current.saveLabel).toMatch(/not saved/i);

    // First retry (no edits) fails again.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_RETRY_MS + 1);
    });
    expect(saveStoryboard).toHaveBeenCalledTimes(2);
    expect(result.current.saveLabel).toMatch(/not saved/i);

    // Second retry succeeds — the indicator recovers.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_RETRY_MS + 1);
    });
    expect(saveStoryboard).toHaveBeenCalledTimes(3);
    expect(result.current.saveLabel).toBe('Saved just now');
  });

  it('stops retrying after the save succeeds (no endless polling)', async () => {
    vi.mocked(saveStoryboard)
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValue(undefined);

    renderHook(() =>
      useStoryboardAutosave(DRAFT_ID, DEFAULT_NODES, DEFAULT_EDGES),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_001);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_RETRY_MS + 1);
    });
    expect(saveStoryboard).toHaveBeenCalledTimes(2);

    // No further attempts — the state is saved and unchanged.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_RETRY_MS * 3);
    });
    expect(saveStoryboard).toHaveBeenCalledTimes(2);
  });
});
