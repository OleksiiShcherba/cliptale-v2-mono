/**
 * Tests for useProjectUiState — debounce coalescing.
 *
 * Covers:
 * - Rapid store changes within 800 ms emit exactly one PUT.
 * - A second burst after the first window closes emits a second PUT.
 */

import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PROJECT_A, DEFAULT_SNAPSHOT } from './useProjectUiState.fixtures';

// ── Hoisted mock objects ─────────────────────────────────────────────────────

const { mockGetUiState, mockPutUiState } = vi.hoisted(() => ({
  mockGetUiState: vi.fn(),
  mockPutUiState: vi.fn(),
}));

const { mockSubscribe, mockGetSnapshot, mockSetAll } = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  return {
    mockSubscribe: vi.fn((listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
    mockGetSnapshot: vi.fn().mockReturnValue({
      playheadFrame: 0,
      zoom: 1,
      pxPerFrame: 4,
      scrollOffsetX: 0,
      selectedClipIds: [],
      volume: 1,
      isMuted: false,
    }),
    mockSetAll: vi.fn(),
  };
});

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('@/features/project/api', () => ({
  getUiState: mockGetUiState,
  putUiState: mockPutUiState,
}));

vi.mock('@/store/ephemeral-store', () => ({
  subscribe: mockSubscribe,
  getSnapshot: mockGetSnapshot,
  setAll: mockSetAll,
}));

// ── Import hook after mocks ───────────────────────────────────────────────────

import { useProjectUiState } from './useProjectUiState';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useProjectUiState — debounce coalescing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockPutUiState.mockResolvedValue(undefined);
    mockGetSnapshot.mockReturnValue(DEFAULT_SNAPSHOT);
    mockSubscribe.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls putUiState once for multiple rapid store changes within 800 ms', async () => {
    mockGetUiState.mockResolvedValue({ state: null, updatedAt: null });

    await act(async () => {
      renderHook(() => useProjectUiState(PROJECT_A, true));
    });

    // Simulate rapid store changes by invoking all registered subscribe callbacks
    const storeListener = mockSubscribe.mock.calls[0]?.[0] as (() => void) | undefined;
    expect(storeListener).toBeDefined();

    // Trigger 5 rapid changes — each should reset the debounce timer
    act(() => {
      storeListener!();
      storeListener!();
      storeListener!();
      storeListener!();
      storeListener!();
    });

    // No PUT yet — still within the 800 ms window
    expect(mockPutUiState).not.toHaveBeenCalled();

    // Advance past the debounce window
    await act(async () => {
      vi.advanceTimersByTime(800);
    });

    // Exactly ONE PUT despite 5 change events
    expect(mockPutUiState).toHaveBeenCalledOnce();
  });

  it('emits a second PUT after another 800 ms burst following the first', async () => {
    mockGetUiState.mockResolvedValue({ state: null, updatedAt: null });

    await act(async () => {
      renderHook(() => useProjectUiState(PROJECT_A, true));
    });

    const storeListener = mockSubscribe.mock.calls[0]?.[0] as (() => void) | undefined;

    // First burst
    act(() => { storeListener!(); storeListener!(); });
    await act(async () => { vi.advanceTimersByTime(800); });
    expect(mockPutUiState).toHaveBeenCalledTimes(1);

    // Second burst after the first window closes
    act(() => { storeListener!(); storeListener!(); });
    await act(async () => { vi.advanceTimersByTime(800); });
    expect(mockPutUiState).toHaveBeenCalledTimes(2);
  });
});
