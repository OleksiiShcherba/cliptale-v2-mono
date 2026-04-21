/**
 * Tests for useProjectUiState — project switch.
 *
 * Covers:
 * - Re-fetches UI state for the new project when projectId changes.
 * - Cancels any pending debounce timer when projectId changes (no stale PUT).
 */

import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PROJECT_A, PROJECT_B, DEFAULT_SNAPSHOT } from './useProjectUiState.fixtures';

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

describe('useProjectUiState — project switch', () => {
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

  it('re-fetches UI state for the new project when projectId changes', async () => {
    mockGetUiState.mockResolvedValue({ state: null, updatedAt: null });

    const { rerender } = renderHook(
      ({ pid }) => useProjectUiState(pid, true),
      { initialProps: { pid: PROJECT_A } },
    );

    await act(async () => {}); // let A's fetch settle

    expect(mockGetUiState).toHaveBeenCalledWith(PROJECT_A);

    await act(async () => {
      rerender({ pid: PROJECT_B });
    });

    expect(mockGetUiState).toHaveBeenCalledWith(PROJECT_B);
  });

  it('cancels any pending debounce timer when projectId changes', async () => {
    mockGetUiState.mockResolvedValue({ state: null, updatedAt: null });

    const { rerender } = renderHook(
      ({ pid }) => useProjectUiState(pid, true),
      { initialProps: { pid: PROJECT_A } },
    );

    await act(async () => {}); // settle A

    const storeListener = mockSubscribe.mock.calls[0]?.[0] as (() => void) | undefined;

    // Trigger a pending save for project A
    act(() => { storeListener!(); });
    expect(mockPutUiState).not.toHaveBeenCalled();

    // Switch to project B (cleanup should cancel the debounce for A)
    await act(async () => {
      rerender({ pid: PROJECT_B });
    });

    // Advance past the debounce window — A's pending PUT must NOT fire
    await act(async () => { vi.advanceTimersByTime(800); });

    expect(mockPutUiState).not.toHaveBeenCalledWith(PROJECT_A, expect.anything());
  });
});
