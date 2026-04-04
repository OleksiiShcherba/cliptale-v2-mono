import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// vi.fn() calls live inside the factory, so no vi.hoisted() needed here.
// vi.mocked() is used after imports to get typed handles.
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
import { useAutosave } from './useAutosave';
import { FAKE_DOC, FAKE_PATCHES, FAKE_INVERSE } from './useAutosave.fixtures';

const mockGetSnapshot = vi.mocked(projectStoreModule.getSnapshot);
const mockSubscribeToProject = vi.mocked(projectStoreModule.subscribe);
const mockHasPendingPatches = vi.mocked(historyStoreModule.hasPendingPatches);
const mockDrainPatches = vi.mocked(historyStoreModule.drainPatches);

function setupDefaultMocks(): void {
  mockGetSnapshot.mockReturnValue(FAKE_DOC as ReturnType<typeof mockGetSnapshot>);
  mockSubscribeToProject.mockReturnValue(() => {});
  mockHasPendingPatches.mockReturnValue(true);
  mockDrainPatches.mockReturnValue({ patches: FAKE_PATCHES, inversePatches: FAKE_INVERSE });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useAutosave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // Initial state
  // -------------------------------------------------------------------------

  it('starts with saveStatus "idle" and lastSavedAt null', async () => {
    const { result } = await act(async () => renderHook(() => useAutosave()));

    expect(result.current.saveStatus).toBe('idle');
    expect(result.current.lastSavedAt).toBeNull();
  });

  it('starts with hasEverEdited false', async () => {
    const { result } = await act(async () => renderHook(() => useAutosave()));

    expect(result.current.hasEverEdited).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Subscription lifecycle
  // -------------------------------------------------------------------------

  it('subscribes to the project store on mount', async () => {
    await act(async () => { renderHook(() => useAutosave()); });

    expect(mockSubscribeToProject).toHaveBeenCalledOnce();
  });

  it('unsubscribes from the project store on unmount', async () => {
    const unsubscribeMock = vi.fn();
    mockSubscribeToProject.mockReturnValue(unsubscribeMock);

    const { unmount } = await act(async () => renderHook(() => useAutosave()));
    unmount();

    expect(unsubscribeMock).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------------------------
  // hasEverEdited
  // -------------------------------------------------------------------------

  it('sets hasEverEdited to true after the first project-store change', async () => {
    let capturedCallback: (() => void) | null = null;
    mockSubscribeToProject.mockImplementation((cb: () => void) => {
      capturedCallback = cb;
      return () => undefined;
    });

    const { result } = await act(async () => renderHook(() => useAutosave()));

    expect(result.current.hasEverEdited).toBe(false);

    act(() => { capturedCallback?.(); });

    expect(result.current.hasEverEdited).toBe(true);
  });

  it('keeps hasEverEdited true after multiple project-store changes', async () => {
    let capturedCallback: (() => void) | null = null;
    mockSubscribeToProject.mockImplementation((cb: () => void) => {
      capturedCallback = cb;
      return () => undefined;
    });

    const { result } = await act(async () => renderHook(() => useAutosave()));

    act(() => { capturedCallback?.(); });
    act(() => { capturedCallback?.(); });

    expect(result.current.hasEverEdited).toBe(true);
  });
});
