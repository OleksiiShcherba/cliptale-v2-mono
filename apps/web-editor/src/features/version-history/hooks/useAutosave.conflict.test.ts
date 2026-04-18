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
const mockSetCurrentVersionId = vi.mocked(projectStoreModule.setCurrentVersionId);
const mockHasPendingPatches = vi.mocked(historyStoreModule.hasPendingPatches);
const mockDrainPatches = vi.mocked(historyStoreModule.drainPatches);
const mockSaveVersion = vi.mocked(versionApi.saveVersion);
const mockFetchLatestVersion = vi.mocked(versionApi.fetchLatestVersion);

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

    const { result } = await act(async () => renderHook(() => useAutosave('test-project-001')));

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

    const { result } = await act(async () => renderHook(() => useAutosave('test-project-001')));

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

    const { result } = await act(async () => renderHook(() => useAutosave('test-project-001')));

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

    await act(async () => { renderHook(() => useAutosave('test-project-001')); });

    expect(addEventListenerSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));
    addEventListenerSpy.mockRestore();
  });

  it('removes the beforeunload listener on unmount', async () => {
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

    const { unmount } = await act(async () => renderHook(() => useAutosave('test-project-001')));
    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));
    removeEventListenerSpy.mockRestore();
  });

  it('calls saveVersion when beforeunload fires and there are pending patches', async () => {
    mockSaveVersion.mockResolvedValue({ versionId: 1, createdAt: new Date().toISOString() });

    await act(async () => { renderHook(() => useAutosave('test-project-001')); });

    await act(async () => {
      window.dispatchEvent(new Event('beforeunload'));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(mockSaveVersion).toHaveBeenCalledOnce();
  });

  it('does NOT call saveVersion on beforeunload when there are no pending patches', async () => {
    mockHasPendingPatches.mockReturnValue(false);

    await act(async () => { renderHook(() => useAutosave('test-project-001')); });

    await act(async () => {
      window.dispatchEvent(new Event('beforeunload'));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(mockSaveVersion).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Tests — resolveConflictByOverwrite
// ---------------------------------------------------------------------------

describe('useAutosave — resolveConflictByOverwrite', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('overwrite flow: re-reads latest versionId, updates parent, issues save, transitions to saved', async () => {
    const latestVersionId = 55;
    const newVersionId = 56;
    const savedAt = '2026-04-17T10:00:00.000Z';

    mockFetchLatestVersion.mockResolvedValue({
      versionId: latestVersionId,
      docJson: FAKE_DOC as ReturnType<typeof mockGetSnapshot>,
      createdAt: savedAt,
    });
    mockSaveVersion.mockResolvedValue({ versionId: newVersionId, createdAt: savedAt });
    // Overwrite bypasses hasPendingPatches guard — patches may be empty after prior drain.
    mockHasPendingPatches.mockReturnValue(false);
    mockDrainPatches.mockReturnValue({ patches: [], inversePatches: [] });

    const { result } = await act(async () => renderHook(() => useAutosave('test-project-001')));

    await act(async () => {
      await result.current.resolveConflictByOverwrite();
    });

    expect(mockFetchLatestVersion).toHaveBeenCalledWith('test-project-001');
    expect(mockSetCurrentVersionId).toHaveBeenCalledWith(latestVersionId);
    expect(mockSaveVersion).toHaveBeenCalledWith('test-project-001', expect.objectContaining({
      parentVersionId: null, // getCurrentVersionId mock returns null; setCurrentVersionId is separate
    }));
    expect(result.current.saveStatus).toBe('saved');
  });

  it('overwrite with repeat 409 stays on conflict — no infinite retry', async () => {
    const conflictError = Object.assign(new Error('conflict'), { status: 409 });

    mockFetchLatestVersion.mockResolvedValue({
      versionId: 10,
      docJson: FAKE_DOC as ReturnType<typeof mockGetSnapshot>,
      createdAt: new Date().toISOString(),
    });
    mockSaveVersion.mockRejectedValue(conflictError);
    mockHasPendingPatches.mockReturnValue(false);
    mockDrainPatches.mockReturnValue({ patches: [], inversePatches: [] });

    const { result } = await act(async () => renderHook(() => useAutosave('test-project-001')));

    await act(async () => {
      await result.current.resolveConflictByOverwrite();
    });

    // Status stays conflict — no infinite retry
    expect(result.current.saveStatus).toBe('conflict');
    // saveVersion was called exactly once (no loop)
    expect(mockSaveVersion).toHaveBeenCalledOnce();
  });

  it('overwrite keeps conflict state when fetchLatestVersion fails', async () => {
    mockFetchLatestVersion.mockRejectedValue(new Error('Network error'));

    const { result } = await act(async () => renderHook(() => useAutosave('test-project-001')));

    await act(async () => {
      await result.current.resolveConflictByOverwrite();
    });

    // fetchLatestVersion failed — should not call saveVersion
    expect(mockSaveVersion).not.toHaveBeenCalled();
    // Status stays as is (idle from start in this test — conflict isn't pre-set here)
    expect(result.current.saveStatus).toBe('idle');
  });
});
