/**
 * Tests for useProjectUiState — beforeunload flush.
 *
 * Covers:
 * - Pending save is flushed synchronously when beforeunload fires.
 * - No PUT on beforeunload when nothing is pending.
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

describe('useProjectUiState — beforeunload flush', () => {
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

  it('fires putUiState immediately on beforeunload if a save is pending', async () => {
    mockGetUiState.mockResolvedValue({ state: null, updatedAt: null });

    await act(async () => {
      renderHook(() => useProjectUiState(PROJECT_A, true));
    });

    const storeListener = mockSubscribe.mock.calls[0]?.[0] as (() => void) | undefined;

    // Trigger a change (starts the 800 ms debounce)
    act(() => { storeListener!(); });
    // Do NOT advance time — the debounce hasn't fired yet

    // Simulate page unload
    act(() => { window.dispatchEvent(new Event('beforeunload')); });

    // PUT should be called immediately, before the timer fires
    expect(mockPutUiState).toHaveBeenCalledOnce();
  });

  it('does NOT call putUiState on beforeunload when no save is pending', async () => {
    mockGetUiState.mockResolvedValue({ state: null, updatedAt: null });

    await act(async () => {
      renderHook(() => useProjectUiState(PROJECT_A, true));
    });

    // No store change — nothing pending
    act(() => { window.dispatchEvent(new Event('beforeunload')); });

    expect(mockPutUiState).not.toHaveBeenCalled();
  });
});
