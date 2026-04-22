/**
 * Tests for useProjectInit — project switch scenario.
 *
 * Verifies that both stores are reset BEFORE fetchLatestVersion resolves when
 * the hook mounts with a new projectId, preventing stale patches from project A
 * from being drained into project B's first autosave.
 */

import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/features/project/api', () => ({
  createProject: vi.fn(),
}));

vi.mock('@/features/version-history/api', () => ({
  fetchLatestVersion: vi.fn(),
}));

const {
  mockResetProjectStore,
  mockSetProjectSilent,
  mockSetCurrentVersionId,
  mockGetSnapshot,
} = vi.hoisted(() => ({
  mockResetProjectStore: vi.fn(),
  mockSetProjectSilent: vi.fn(),
  mockSetCurrentVersionId: vi.fn(),
  mockGetSnapshot: vi.fn().mockReturnValue({
    schemaVersion: 1,
    id: '00000000-0000-0000-0000-000000000001',
    title: 'Dev Project',
    fps: 30,
    durationFrames: 300,
    width: 1920,
    height: 1080,
    tracks: [],
    clips: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }),
}));

vi.mock('@/store/project-store', () => ({
  getSnapshot: mockGetSnapshot,
  setProjectSilent: mockSetProjectSilent,
  setCurrentVersionId: mockSetCurrentVersionId,
  resetProjectStore: mockResetProjectStore,
}));

const { mockResetHistoryStore } = vi.hoisted(() => ({
  mockResetHistoryStore: vi.fn(),
}));

vi.mock('@/store/history-store', () => ({
  resetHistoryStore: mockResetHistoryStore,
}));

import * as projectApi from '@/features/project/api';
import * as versionHistoryApi from '@/features/version-history/api';
import { useProjectInit } from './useProjectInit';

const mockFetchLatestVersion = vi.mocked(versionHistoryApi.fetchLatestVersion);
const mockCreateProject = vi.mocked(projectApi.createProject);

// ── Helpers ──────────────────────────────────────────────────────────────────

function setUrlSearch(search: string): void {
  Object.defineProperty(window, 'location', {
    writable: true,
    value: { ...window.location, href: `http://localhost/${search}`, search },
  });
}

const replaceStateSpy = vi.spyOn(window.history, 'replaceState');

const mockLatestVersion = {
  versionId: 7,
  docJson: { id: 'proj-abc', title: 'Saved Project', durationFrames: 300 },
  createdAt: '2026-04-17T10:00:00.000Z',
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useProjectInit — project-switch reset sequence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    replaceStateSpy.mockImplementation(() => {});
  });

  afterEach(() => {
    setUrlSearch('');
  });

  it('calls resetProjectStore with the projectId BEFORE fetchLatestVersion resolves', async () => {
    setUrlSearch('?projectId=project-b');

    // Use a deferred promise to intercept when resetProjectStore was called
    let resolveFetch!: (v: typeof mockLatestVersion) => void;
    const fetchPromise = new Promise<typeof mockLatestVersion>((resolve) => {
      resolveFetch = resolve;
    });
    mockFetchLatestVersion.mockReturnValue(fetchPromise as ReturnType<typeof mockFetchLatestVersion>);

    const { result } = renderHook(() => useProjectInit());

    // resetProjectStore should be called synchronously when the effect fires,
    // before the fetch resolves.
    await waitFor(() => expect(mockResetProjectStore).toHaveBeenCalledWith('project-b'));

    // Fetch hasn't resolved yet — hook is still in hydrating state
    expect(result.current.status).toBe('hydrating');

    // Now resolve the fetch
    resolveFetch(mockLatestVersion);

    await waitFor(() => expect(result.current.status).toBe('ready'));
  });

  it('calls resetHistoryStore BEFORE fetchLatestVersion resolves', async () => {
    setUrlSearch('?projectId=project-b');

    let resolveFetch!: (v: typeof mockLatestVersion) => void;
    const fetchPromise = new Promise<typeof mockLatestVersion>((resolve) => {
      resolveFetch = resolve;
    });
    mockFetchLatestVersion.mockReturnValue(fetchPromise as ReturnType<typeof mockFetchLatestVersion>);

    renderHook(() => useProjectInit());

    await waitFor(() => expect(mockResetHistoryStore).toHaveBeenCalledTimes(1));

    resolveFetch(mockLatestVersion);
    // Clean up
    await waitFor(() => expect(mockSetProjectSilent).toHaveBeenCalled());
  });

  it('calls resetProjectStore before setProjectSilent', async () => {
    setUrlSearch('?projectId=project-b');
    mockFetchLatestVersion.mockResolvedValue(mockLatestVersion);

    const callOrder: string[] = [];
    mockResetProjectStore.mockImplementation(() => { callOrder.push('resetProjectStore'); });
    mockSetProjectSilent.mockImplementation(() => { callOrder.push('setProjectSilent'); });

    const { result } = renderHook(() => useProjectInit());
    await waitFor(() => expect(result.current.status).toBe('ready'));

    const resetIdx = callOrder.indexOf('resetProjectStore');
    const silentIdx = callOrder.indexOf('setProjectSilent');
    expect(resetIdx).toBeGreaterThanOrEqual(0);
    expect(silentIdx).toBeGreaterThan(resetIdx);
  });

  it('setProjectSilent is still called with the docJson after reset + fetch resolves', async () => {
    setUrlSearch('?projectId=project-b');
    mockFetchLatestVersion.mockResolvedValue(mockLatestVersion);

    const { result } = renderHook(() => useProjectInit());
    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(mockSetProjectSilent).toHaveBeenCalledWith({
      ...mockLatestVersion.docJson,
      id: 'project-b',
    });
  });

  it('setCurrentVersionId is still called after reset + fetch resolves', async () => {
    setUrlSearch('?projectId=project-b');
    mockFetchLatestVersion.mockResolvedValue(mockLatestVersion);

    const { result } = renderHook(() => useProjectInit());
    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(mockSetCurrentVersionId).toHaveBeenCalledWith(7);
  });

  it('resets on each new hydratingProjectId (simulate project switch)', async () => {
    // First mount: project A
    setUrlSearch('?projectId=project-a');
    mockFetchLatestVersion.mockResolvedValue({ ...mockLatestVersion, versionId: 1 });
    const { result: resultA } = renderHook(() => useProjectInit());
    await waitFor(() => expect(resultA.current.status).toBe('ready'));

    expect(mockResetProjectStore).toHaveBeenCalledWith('project-a');
    expect(mockResetHistoryStore).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();

    // Second mount: project B
    setUrlSearch('?projectId=project-b');
    mockFetchLatestVersion.mockResolvedValue({ ...mockLatestVersion, versionId: 2 });
    const { result: resultB } = renderHook(() => useProjectInit());
    await waitFor(() => expect(resultB.current.status).toBe('ready'));

    expect(mockResetProjectStore).toHaveBeenCalledWith('project-b');
    expect(mockResetHistoryStore).toHaveBeenCalledTimes(1);
  });

  it('also resets on the create flow (no projectId in URL)', async () => {
    setUrlSearch('');
    mockCreateProject.mockResolvedValue({ projectId: 'new-created-project' });
    mockFetchLatestVersion.mockResolvedValue(mockLatestVersion);

    const { result } = renderHook(() => useProjectInit());
    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(mockResetProjectStore).toHaveBeenCalledWith('new-created-project');
    expect(mockResetHistoryStore).toHaveBeenCalledTimes(1);
  });
});
