import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Mocks — vi.hoisted() ensures these are initialized before vi.mock factories run
// ---------------------------------------------------------------------------

const { mockSetProject, mockSetCurrentVersionId, mockListVersions, mockRestoreVersion } =
  vi.hoisted(() => ({
    mockSetProject: vi.fn(),
    mockSetCurrentVersionId: vi.fn(),
    mockListVersions: vi.fn(),
    mockRestoreVersion: vi.fn(),
  }));

vi.mock('@/store/project-store', () => ({
  setProject: (...args: unknown[]) => mockSetProject(...args),
  setCurrentVersionId: (id: number) => mockSetCurrentVersionId(id),
}));

vi.mock('@/features/version-history/api', () => ({
  listVersions: (...args: unknown[]) => mockListVersions(...args),
  restoreVersion: (...args: unknown[]) => mockRestoreVersion(...args),
}));


import { useVersionHistory } from './useVersionHistory';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VERSIONS = [
  { versionId: 5, createdAt: '2026-04-03T12:00:00.000Z', createdByUserId: 'u1', durationFrames: 300 },
  { versionId: 4, createdAt: '2026-04-03T11:00:00.000Z', createdByUserId: 'u1', durationFrames: 280 },
];

const RESTORED_DOC = {
  schemaVersion: 1,
  id: 'test-project-001',
  title: 'Restored',
  fps: 30,
  durationFrames: 300,
  width: 1920,
  height: 1080,
  tracks: [],
  clips: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-04-03T12:00:00.000Z',
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
    },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }): React.ReactElement =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return { queryClient, Wrapper };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useVersionHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // List loading
  // -------------------------------------------------------------------------

  it('returns an empty versions array while loading', () => {
    mockListVersions.mockReturnValue(new Promise(() => {})); // never resolves
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useVersionHistory('test-project-001'), { wrapper: Wrapper });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.versions).toEqual([]);
  });

  it('returns versions from the API after loading', async () => {
    mockListVersions.mockResolvedValue(VERSIONS);
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useVersionHistory('test-project-001'), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.versions).toEqual(VERSIONS);
  });

  it('sets isError when the API call fails', async () => {
    mockListVersions.mockRejectedValue(new Error('network error'));
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useVersionHistory('test-project-001'), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.versions).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // restoreToVersion — success path
  // -------------------------------------------------------------------------

  it('calls setProject with the restored docJson on success', async () => {
    mockListVersions.mockResolvedValue(VERSIONS);
    mockRestoreVersion.mockResolvedValue({ docJson: RESTORED_DOC });
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useVersionHistory('test-project-001'), { wrapper: Wrapper });

    await act(async () => {
      await result.current.restoreToVersion(4);
    });

    expect(mockSetProject).toHaveBeenCalledOnce();
    expect(mockSetProject).toHaveBeenCalledWith(RESTORED_DOC);
  });

  it('calls setCurrentVersionId with the restored versionId on success', async () => {
    mockListVersions.mockResolvedValue(VERSIONS);
    mockRestoreVersion.mockResolvedValue({ docJson: RESTORED_DOC });
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useVersionHistory('test-project-001'), { wrapper: Wrapper });

    await act(async () => {
      await result.current.restoreToVersion(4);
    });

    expect(mockSetCurrentVersionId).toHaveBeenCalledOnce();
    expect(mockSetCurrentVersionId).toHaveBeenCalledWith(4);
  });

  it('calls setCurrentVersionId after setProject so the pointer is always updated', async () => {
    mockListVersions.mockResolvedValue(VERSIONS);
    mockRestoreVersion.mockResolvedValue({ docJson: RESTORED_DOC });

    const callOrder: string[] = [];
    mockSetProject.mockImplementation(() => callOrder.push('setProject'));
    mockSetCurrentVersionId.mockImplementation(() => callOrder.push('setCurrentVersionId'));

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useVersionHistory('test-project-001'), { wrapper: Wrapper });

    await act(async () => {
      await result.current.restoreToVersion(5);
    });

    expect(callOrder).toEqual(['setProject', 'setCurrentVersionId']);
  });

  // -------------------------------------------------------------------------
  // restoreToVersion — isRestoring flag
  // -------------------------------------------------------------------------

  it('sets isRestoring to false after a successful restore', async () => {
    mockListVersions.mockResolvedValue(VERSIONS);
    mockRestoreVersion.mockResolvedValue({ docJson: RESTORED_DOC });
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useVersionHistory('test-project-001'), { wrapper: Wrapper });

    await act(async () => {
      await result.current.restoreToVersion(4);
    });

    expect(result.current.isRestoring).toBe(false);
  });

  // -------------------------------------------------------------------------
  // restoreToVersion — error path
  // -------------------------------------------------------------------------

  it('does not call setProject or setCurrentVersionId when the API throws', async () => {
    mockListVersions.mockResolvedValue(VERSIONS);
    mockRestoreVersion.mockRejectedValue(new Error('restore failed'));
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useVersionHistory('test-project-001'), { wrapper: Wrapper });

    await act(async () => {
      await result.current.restoreToVersion(4).catch(() => {});
    });

    expect(mockSetProject).not.toHaveBeenCalled();
    expect(mockSetCurrentVersionId).not.toHaveBeenCalled();
  });

  it('sets isRestoring to false even when the API throws', async () => {
    mockListVersions.mockResolvedValue(VERSIONS);
    mockRestoreVersion.mockRejectedValue(new Error('restore failed'));
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useVersionHistory('test-project-001'), { wrapper: Wrapper });

    await act(async () => {
      await result.current.restoreToVersion(4).catch(() => {});
    });

    expect(result.current.isRestoring).toBe(false);
  });
});
