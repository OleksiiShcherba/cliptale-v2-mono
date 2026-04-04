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
// Tests — debounce timing
// ---------------------------------------------------------------------------

describe('useAutosave — debounce timing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does NOT call saveVersion before the 2s debounce window elapses', async () => {
    let capturedCallback: (() => void) | null = null;
    mockSubscribeToProject.mockImplementation((cb: () => void) => {
      capturedCallback = cb;
      return () => undefined;
    });

    await act(async () => { renderHook(() => useAutosave()); });

    act(() => { capturedCallback?.(); });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(mockSaveVersion).not.toHaveBeenCalled();
  });

  it('calls saveVersion after the 2s debounce window', async () => {
    mockSaveVersion.mockResolvedValue({ versionId: 1, createdAt: new Date().toISOString() });

    let capturedCallback: (() => void) | null = null;
    mockSubscribeToProject.mockImplementation((cb: () => void) => {
      capturedCallback = cb;
      return () => undefined;
    });

    await act(async () => { renderHook(() => useAutosave()); });

    act(() => { capturedCallback?.(); });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(mockSaveVersion).toHaveBeenCalledOnce();
    expect(mockSaveVersion).toHaveBeenCalledWith('test-project-001', {
      doc_json: FAKE_DOC,
      patches: FAKE_PATCHES,
      inversePatches: FAKE_INVERSE,
      parentVersionId: null,
    });
  });

  it('resets the debounce timer on rapid sequential changes', async () => {
    mockSaveVersion.mockResolvedValue({ versionId: 1, createdAt: new Date().toISOString() });

    let capturedCallback: (() => void) | null = null;
    mockSubscribeToProject.mockImplementation((cb: () => void) => {
      capturedCallback = cb;
      return () => undefined;
    });

    await act(async () => { renderHook(() => useAutosave()); });

    act(() => { capturedCallback?.(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    act(() => { capturedCallback?.(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    act(() => { capturedCallback?.(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });

    // 1500ms elapsed total — no save yet
    expect(mockSaveVersion).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    // Only ONE save despite three triggers
    expect(mockSaveVersion).toHaveBeenCalledOnce();
  });
});
