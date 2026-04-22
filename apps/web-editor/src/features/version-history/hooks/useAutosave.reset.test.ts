/**
 * Tests for useAutosave — reset/project-switch regression.
 *
 * Covers:
 * - hasPendingPatches flipping false mid-debounce → performSave does NOT fire.
 * - beforeunload flush path still works after a reset sequence.
 */

import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/store/project-store', () => ({
  getSnapshot: vi.fn(),
  subscribe: vi.fn().mockReturnValue(() => {}),
  setCurrentVersionId: vi.fn(),
  getCurrentVersionId: vi.fn(),
}));

vi.mock('@/store/history-store', () => ({
  drainPatches: vi.fn(),
  hasPendingPatches: vi.fn(),
}));

vi.mock('@/features/version-history/api', () => ({
  saveVersion: vi.fn(),
  fetchLatestVersion: vi.fn(),
}));

import * as projectStoreModule from '@/store/project-store';
import * as historyStoreModule from '@/store/history-store';
import * as versionApi from '@/features/version-history/api';
import { useAutosave } from './useAutosave';
import { FAKE_DOC, FAKE_PATCHES, FAKE_INVERSE } from './useAutosave.fixtures';

const mockGetSnapshot = vi.mocked(projectStoreModule.getSnapshot);
const mockSubscribeToProject = vi.mocked(projectStoreModule.subscribe);
const mockGetCurrentVersionId = vi.mocked(projectStoreModule.getCurrentVersionId);
const mockHasPendingPatches = vi.mocked(historyStoreModule.hasPendingPatches);
const mockDrainPatches = vi.mocked(historyStoreModule.drainPatches);
const mockSaveVersion = vi.mocked(versionApi.saveVersion);

function setupDefaultMocks(): void {
  mockGetSnapshot.mockReturnValue(FAKE_DOC as ReturnType<typeof mockGetSnapshot>);
  mockSubscribeToProject.mockReturnValue(() => {});
  mockGetCurrentVersionId.mockReturnValue(null);
  mockHasPendingPatches.mockReturnValue(true);
  mockDrainPatches.mockReturnValue({ patches: FAKE_PATCHES, inversePatches: FAKE_INVERSE });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useAutosave — reset regression', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does NOT call saveVersion when hasPendingPatches flips to false before the debounce fires', async () => {
    // Simulate: patches were pending when the store change fired the debounce,
    // but by the time the timer expires (after a project reset) there are none.
    mockSaveVersion.mockResolvedValue({ versionId: 1, createdAt: new Date().toISOString() });

    let capturedCallback: (() => void) | null = null;
    mockSubscribeToProject.mockImplementation((cb: () => void) => {
      capturedCallback = cb;
      return () => undefined;
    });

    await act(async () => { renderHook(() => useAutosave('project-a')); });

    // Trigger a debounce — hasPendingPatches is true at this point
    act(() => { capturedCallback?.(); });

    // Simulate reset happening mid-debounce: patches are now gone
    mockHasPendingPatches.mockReturnValue(false);

    // Advance past the debounce window
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });

    // performSave should skip because hasPendingPatches() is false and force=false
    expect(mockSaveVersion).not.toHaveBeenCalled();
  });

  it('calls saveVersion normally when hasPendingPatches stays true through the debounce window', async () => {
    mockSaveVersion.mockResolvedValue({ versionId: 1, createdAt: new Date().toISOString() });

    let capturedCallback: (() => void) | null = null;
    mockSubscribeToProject.mockImplementation((cb: () => void) => {
      capturedCallback = cb;
      return () => undefined;
    });

    await act(async () => { renderHook(() => useAutosave('project-a')); });

    act(() => { capturedCallback?.(); });

    // hasPendingPatches stays true
    mockHasPendingPatches.mockReturnValue(true);

    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });

    expect(mockSaveVersion).toHaveBeenCalledOnce();
  });

  it('beforeunload flush path: saveVersion fires when hasPendingPatches is true on tab close', async () => {
    mockSaveVersion.mockResolvedValue({ versionId: 2, createdAt: new Date().toISOString() });
    mockHasPendingPatches.mockReturnValue(true);

    await act(async () => { renderHook(() => useAutosave('project-a')); });

    // Simulate beforeunload
    await act(async () => {
      window.dispatchEvent(new Event('beforeunload'));
      // Advance timers to allow the async performSave to complete
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(mockSaveVersion).toHaveBeenCalledOnce();
  });

  it('beforeunload flush path: saveVersion does NOT fire when hasPendingPatches is false', async () => {
    mockSaveVersion.mockResolvedValue({ versionId: 2, createdAt: new Date().toISOString() });
    // Simulate post-reset state: no pending patches
    mockHasPendingPatches.mockReturnValue(false);

    await act(async () => { renderHook(() => useAutosave('project-b')); });

    await act(async () => {
      window.dispatchEvent(new Event('beforeunload'));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(mockSaveVersion).not.toHaveBeenCalled();
  });
});
