/**
 * Tests for useProjectUiState — restore path and not-yet-ready guard.
 *
 * Covers:
 * - Restore path: saved state is fetched and applied via setAll on project ready.
 * - First-open null path: null state → setAll not called; defaults stay.
 * - Invalid/corrupt state: ignored gracefully.
 * - Not-yet-ready: fetch and subscribe do not fire until isProjectReady = true.
 */

import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PROJECT_A, savedState, DEFAULT_SNAPSHOT } from './useProjectUiState.fixtures';

// ── Hoisted mock objects ─────────────────────────────────────────────────────

const { mockGetUiState, mockPutUiState } = vi.hoisted(() => ({
  mockGetUiState: vi.fn(),
  mockPutUiState: vi.fn(),
}));

const { mockSubscribe, mockGetSnapshot, mockSetAll } = vi.hoisted(() => ({
  mockSubscribe: vi.fn((_listener: () => void) => () => {}),
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
}));

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

describe('useProjectUiState — restore path', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockPutUiState.mockResolvedValue(undefined);
    mockGetSnapshot.mockReturnValue(DEFAULT_SNAPSHOT);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('saved state applied on ready', () => {
    it('calls getUiState with the project id when isProjectReady becomes true', async () => {
      mockGetUiState.mockResolvedValue({ state: savedState, updatedAt: '2026-04-20T10:00:00Z' });

      const { rerender } = renderHook(
        ({ pid, ready }) => useProjectUiState(pid, ready),
        { initialProps: { pid: PROJECT_A, ready: false } },
      );

      expect(mockGetUiState).not.toHaveBeenCalled();

      await act(async () => {
        rerender({ pid: PROJECT_A, ready: true });
      });

      expect(mockGetUiState).toHaveBeenCalledOnce();
      expect(mockGetUiState).toHaveBeenCalledWith(PROJECT_A);
    });

    it('calls setAll with the server state when state is valid', async () => {
      mockGetUiState.mockResolvedValue({ state: savedState, updatedAt: '2026-04-20T10:00:00Z' });

      await act(async () => {
        renderHook(() => useProjectUiState(PROJECT_A, true));
      });

      expect(mockSetAll).toHaveBeenCalledOnce();
      expect(mockSetAll).toHaveBeenCalledWith(savedState);
    });

    it('does NOT call setAll when state is null (first open)', async () => {
      mockGetUiState.mockResolvedValue({ state: null, updatedAt: null });

      await act(async () => {
        renderHook(() => useProjectUiState(PROJECT_A, true));
      });

      expect(mockSetAll).not.toHaveBeenCalled();
    });

    it('does NOT call setAll when state is undefined', async () => {
      mockGetUiState.mockResolvedValue({ state: undefined, updatedAt: null });

      await act(async () => {
        renderHook(() => useProjectUiState(PROJECT_A, true));
      });

      expect(mockSetAll).not.toHaveBeenCalled();
    });

    it('does NOT call setAll when state has wrong shape (corrupt data)', async () => {
      mockGetUiState.mockResolvedValue({ state: { notAValidField: true }, updatedAt: null });

      await act(async () => {
        renderHook(() => useProjectUiState(PROJECT_A, true));
      });

      expect(mockSetAll).not.toHaveBeenCalled();
    });

    it('does NOT throw when getUiState rejects (network error)', async () => {
      mockGetUiState.mockRejectedValue(new Error('Network error'));

      await expect(
        act(async () => {
          renderHook(() => useProjectUiState(PROJECT_A, true));
        }),
      ).resolves.not.toThrow();

      expect(mockSetAll).not.toHaveBeenCalled();
    });
  });

  describe('not-yet-ready guard', () => {
    it('does NOT call getUiState while isProjectReady is false', () => {
      mockGetUiState.mockResolvedValue({ state: null, updatedAt: null });

      renderHook(() => useProjectUiState(PROJECT_A, false));

      expect(mockGetUiState).not.toHaveBeenCalled();
    });

    it('does NOT subscribe to ephemeral-store while isProjectReady is false', () => {
      renderHook(() => useProjectUiState(PROJECT_A, false));
      expect(mockSubscribe).not.toHaveBeenCalled();
    });
  });
});
