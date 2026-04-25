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
// Tests — successful save + concurrent guard
// ---------------------------------------------------------------------------

describe('useAutosave — save', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sets saveStatus to "saved" and updates lastSavedAt on success', async () => {
    const savedAt = '2026-04-03T12:00:00.000Z';
    mockSaveVersion.mockResolvedValue({ versionId: 42, createdAt: savedAt });

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

    expect(result.current.saveStatus).toBe('saved');
    expect(result.current.lastSavedAt).toEqual(new Date(savedAt));
    expect(mockSetCurrentVersionId).toHaveBeenCalledWith(42);
  });

  it('uses the correct parentVersionId from getCurrentVersionId', async () => {
    mockGetCurrentVersionId.mockReturnValue(7);
    mockSaveVersion.mockResolvedValue({ versionId: 8, createdAt: new Date().toISOString() });

    let capturedCallback: (() => void) | null = null;
    mockSubscribeToProject.mockImplementation((cb: () => void) => {
      capturedCallback = cb;
      return () => undefined;
    });

    await act(async () => { renderHook(() => useAutosave('test-project-001')); });
    act(() => { capturedCallback?.(); });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(mockSaveVersion).toHaveBeenCalledWith('test-project-001', expect.objectContaining({
      parentVersionId: 7,
    }));
  });

  it('manual save() triggers the API call immediately without debounce elapse', async () => {
    mockSaveVersion.mockResolvedValue({ versionId: 99, createdAt: new Date().toISOString() });

    const { result } = await act(async () => renderHook(() => useAutosave('test-project-001')));

    // Call save() without triggering any subscription change (no debounce needed)
    await act(async () => {
      await result.current.save();
    });

    expect(mockSaveVersion).toHaveBeenCalledOnce();
    expect(result.current.saveStatus).toBe('saved');
  });

  it('does not start a second save while one is already in flight', async () => {
    let resolveFirst!: (v: { versionId: number; createdAt: string }) => void;
    mockSaveVersion.mockReturnValueOnce(
      new Promise<{ versionId: number; createdAt: string }>((res) => { resolveFirst = res; }),
    );

    let capturedCallback: (() => void) | null = null;
    mockSubscribeToProject.mockImplementation((cb: () => void) => {
      capturedCallback = cb;
      return () => undefined;
    });

    await act(async () => { renderHook(() => useAutosave('test-project-001')); });

    // Start first save (still in flight)
    act(() => { capturedCallback?.(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });

    // Try to start a second save while first is in flight
    act(() => { capturedCallback?.(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });

    // Only one API call
    expect(mockSaveVersion).toHaveBeenCalledOnce();

    // Resolve first save for cleanup
    act(() => { resolveFirst({ versionId: 1, createdAt: new Date().toISOString() }); });
  });
});
