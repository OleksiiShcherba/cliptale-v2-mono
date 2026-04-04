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
}));

vi.mock('@/lib/constants', () => ({
  DEV_PROJECT_ID: 'test-project-001',
}));

import * as projectStoreModule from '@/store/project-store';
import * as historyStoreModule from '@/store/history-store';
import * as versionApi from '@/features/version-history/api';
import { useAutosave } from './useAutosave';
import { FAKE_DOC, FAKE_PATCHES, FAKE_INVERSE } from './useAutosave.fixtures';

const mockGetSnapshot = vi.mocked(projectStoreModule.getSnapshot);
const mockSubscribeToProject = vi.mocked(projectStoreModule.subscribe);
const mockHasPendingPatches = vi.mocked(historyStoreModule.hasPendingPatches);
const mockDrainPatches = vi.mocked(historyStoreModule.drainPatches);
const mockSaveVersion = vi.mocked(versionApi.saveVersion);

function setupDefaultMocks(): void {
  mockGetSnapshot.mockReturnValue(FAKE_DOC as ReturnType<typeof mockGetSnapshot>);
  mockSubscribeToProject.mockReturnValue(() => {});
  vi.mocked(projectStoreModule.getCurrentVersionId).mockReturnValue(null);
  mockHasPendingPatches.mockReturnValue(true);
  mockDrainPatches.mockReturnValue({ patches: FAKE_PATCHES, inversePatches: FAKE_INVERSE });
}

// ---------------------------------------------------------------------------
// Tests — conflict, non-conflict error, beforeunload
// ---------------------------------------------------------------------------

describe('useAutosave — conflict & error states', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sets saveStatus to "conflict" when API returns 409', async () => {
    const conflictError = Object.assign(new Error('conflict'), { status: 409 });
    mockSaveVersion.mockRejectedValue(conflictError);

    let capturedCallback: (() => void) | null = null;
    mockSubscribeToProject.mockImplementation((cb: () => void) => {
      capturedCallback = cb;
      return () => undefined;
    });

    const { result } = await act(async () => renderHook(() => useAutosave()));

    act(() => { capturedCallback?.(); });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(result.current.saveStatus).toBe('conflict');
  });

  it('does NOT attempt another save when in conflict state', async () => {
    const conflictError = Object.assign(new Error('conflict'), { status: 409 });
    mockSaveVersion.mockRejectedValue(conflictError);

    let capturedCallback: (() => void) | null = null;
    mockSubscribeToProject.mockImplementation((cb: () => void) => {
      capturedCallback = cb;
      return () => undefined;
    });

    const { result } = await act(async () => renderHook(() => useAutosave()));

    // Trigger conflict
    act(() => { capturedCallback?.(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });

    expect(result.current.saveStatus).toBe('conflict');

    // Trigger another change — should be ignored in conflict state
    mockSaveVersion.mockClear();
    act(() => { capturedCallback?.(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });

    expect(mockSaveVersion).not.toHaveBeenCalled();
  });

  it('sets saveStatus back to "idle" on non-409 error so next change can retry', async () => {
    mockSaveVersion.mockRejectedValue(new Error('Network error'));

    let capturedCallback: (() => void) | null = null;
    mockSubscribeToProject.mockImplementation((cb: () => void) => {
      capturedCallback = cb;
      return () => undefined;
    });

    const { result } = await act(async () => renderHook(() => useAutosave()));

    act(() => { capturedCallback?.(); });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(result.current.saveStatus).toBe('idle');
  });
});

describe('useAutosave — beforeunload', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('registers a beforeunload listener on mount', async () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

    await act(async () => { renderHook(() => useAutosave()); });

    expect(addEventListenerSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));
    addEventListenerSpy.mockRestore();
  });

  it('removes the beforeunload listener on unmount', async () => {
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

    const { unmount } = await act(async () => renderHook(() => useAutosave()));
    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));
    removeEventListenerSpy.mockRestore();
  });

  it('calls saveVersion when beforeunload fires and there are pending patches', async () => {
    mockSaveVersion.mockResolvedValue({ versionId: 1, createdAt: new Date().toISOString() });

    await act(async () => { renderHook(() => useAutosave()); });

    await act(async () => {
      window.dispatchEvent(new Event('beforeunload'));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(mockSaveVersion).toHaveBeenCalledOnce();
  });

  it('does NOT call saveVersion on beforeunload when there are no pending patches', async () => {
    mockHasPendingPatches.mockReturnValue(false);

    await act(async () => { renderHook(() => useAutosave()); });

    await act(async () => {
      window.dispatchEvent(new Event('beforeunload'));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(mockSaveVersion).not.toHaveBeenCalled();
  });
});
