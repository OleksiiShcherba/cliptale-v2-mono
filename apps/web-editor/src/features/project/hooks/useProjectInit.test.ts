import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/features/project/api', () => ({
  createProject: vi.fn(),
}));

vi.mock('@/features/version-history/api', () => ({
  fetchLatestVersion: vi.fn(),
}));

vi.mock('@/store/project-store', () => ({
  setProjectSilent: vi.fn(),
  setCurrentVersionId: vi.fn(),
}));

import * as projectApi from '@/features/project/api';
import * as versionHistoryApi from '@/features/version-history/api';
import * as projectStore from '@/store/project-store';
import { useProjectInit } from './useProjectInit';

const mockCreateProject = vi.mocked(projectApi.createProject);
const mockFetchLatestVersion = vi.mocked(versionHistoryApi.fetchLatestVersion);
const mockSetProjectSilent = vi.mocked(projectStore.setProjectSilent);
const mockSetCurrentVersionId = vi.mocked(projectStore.setCurrentVersionId);

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Replaces window.location with a given search string for the duration of a test. */
function setUrlSearch(search: string): void {
  Object.defineProperty(window, 'location', {
    writable: true,
    value: { ...window.location, href: `http://localhost/${search}`, search },
  });
}

/** Builds a fake 404 error matching the shape thrown by fetchLatestVersion. */
function makeNotFoundError(): Error {
  const err = new Error('No versions found for this project');
  (err as Error & { status: number }).status = 404;
  return err;
}

// Capture history.replaceState calls
const replaceStateSpy = vi.spyOn(window.history, 'replaceState');

const mockLatestVersion = {
  versionId: 7,
  docJson: { id: 'proj-abc', title: 'Saved Project', durationFrames: 300 },
  createdAt: '2026-04-17T10:00:00.000Z',
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useProjectInit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    replaceStateSpy.mockImplementation(() => {});
  });

  afterEach(() => {
    setUrlSearch('');
  });

  // ── projectId in URL — hydration happy path ───────────────────────────────

  describe('when projectId is present in the URL', () => {
    it('starts in hydrating state (not ready) immediately', () => {
      setUrlSearch('?projectId=url-project-123');
      mockFetchLatestVersion.mockResolvedValue(mockLatestVersion);
      const { result } = renderHook(() => useProjectInit());
      // Before fetchLatestVersion resolves, state is 'hydrating'.
      expect(result.current.status).toBe('hydrating');
    });

    it('does NOT call createProject when URL has projectId', () => {
      setUrlSearch('?projectId=url-project-123');
      mockFetchLatestVersion.mockResolvedValue(mockLatestVersion);
      renderHook(() => useProjectInit());
      expect(mockCreateProject).not.toHaveBeenCalled();
    });

    it('does NOT call history.replaceState when URL already has projectId', () => {
      setUrlSearch('?projectId=url-project-123');
      mockFetchLatestVersion.mockResolvedValue(mockLatestVersion);
      renderHook(() => useProjectInit());
      expect(replaceStateSpy).not.toHaveBeenCalled();
    });

    it('calls fetchLatestVersion with the URL projectId', async () => {
      setUrlSearch('?projectId=url-project-123');
      mockFetchLatestVersion.mockResolvedValue(mockLatestVersion);
      renderHook(() => useProjectInit());

      await waitFor(() => expect(mockFetchLatestVersion).toHaveBeenCalledWith('url-project-123'));
    });

    it('calls setProjectSilent with the fetched docJson on success', async () => {
      setUrlSearch('?projectId=url-project-123');
      mockFetchLatestVersion.mockResolvedValue(mockLatestVersion);
      const { result } = renderHook(() => useProjectInit());

      await waitFor(() => expect(result.current.status).toBe('ready'));

      expect(mockSetProjectSilent).toHaveBeenCalledWith(mockLatestVersion.docJson);
    });

    it('calls setCurrentVersionId with the fetched versionId on success', async () => {
      setUrlSearch('?projectId=url-project-123');
      mockFetchLatestVersion.mockResolvedValue(mockLatestVersion);
      const { result } = renderHook(() => useProjectInit());

      await waitFor(() => expect(result.current.status).toBe('ready'));

      expect(mockSetCurrentVersionId).toHaveBeenCalledWith(7);
    });

    it('transitions to ready with the URL projectId after hydration', async () => {
      setUrlSearch('?projectId=url-project-123');
      mockFetchLatestVersion.mockResolvedValue(mockLatestVersion);
      const { result } = renderHook(() => useProjectInit());

      await waitFor(() => expect(result.current.status).toBe('ready'));

      expect(result.current.projectId).toBe('url-project-123');
    });
  });

  // ── 404 from fetchLatestVersion — fall through to blank seed ─────────────

  describe('when fetchLatestVersion returns 404 (new project, no versions)', () => {
    it('transitions to ready without mutating the store', async () => {
      setUrlSearch('?projectId=new-project-456');
      mockFetchLatestVersion.mockRejectedValue(makeNotFoundError());
      const { result } = renderHook(() => useProjectInit());

      await waitFor(() => expect(result.current.status).toBe('ready'));

      expect(result.current.projectId).toBe('new-project-456');
      expect(mockSetProjectSilent).not.toHaveBeenCalled();
      expect(mockSetCurrentVersionId).not.toHaveBeenCalled();
    });
  });

  // ── fetch error (non-404) — surface as error state ───────────────────────

  describe('when fetchLatestVersion throws a non-404 error', () => {
    it('transitions to error state', async () => {
      setUrlSearch('?projectId=broken-project');
      mockFetchLatestVersion.mockRejectedValue(new Error('Network error'));
      const { result } = renderHook(() => useProjectInit());

      await waitFor(() => expect(result.current.status).toBe('error'));

      expect(result.current.projectId).toBeNull();
      if (result.current.status === 'error') {
        expect(result.current.error).toContain('Network error');
      }
    });

    it('uses "Unknown error loading project" when rejection is not an Error', async () => {
      setUrlSearch('?projectId=broken-project');
      mockFetchLatestVersion.mockRejectedValue('string-error');
      const { result } = renderHook(() => useProjectInit());

      await waitFor(() => expect(result.current.status).toBe('error'));

      if (result.current.status === 'error') {
        expect(result.current.error).toBe('Unknown error loading project');
      }
    });
  });

  // ── no projectId in URL — create flow ────────────────────────────────────

  describe('when no projectId is in the URL', () => {
    it('starts in loading state', () => {
      setUrlSearch('');
      mockCreateProject.mockResolvedValue({ projectId: 'new-project-abc' });
      mockFetchLatestVersion.mockRejectedValue(makeNotFoundError());
      const { result } = renderHook(() => useProjectInit());
      expect(result.current.status).toBe('loading');
      expect(result.current.projectId).toBeNull();
    });

    it('calls createProject exactly once', async () => {
      setUrlSearch('');
      mockCreateProject.mockResolvedValue({ projectId: 'new-project-abc' });
      mockFetchLatestVersion.mockRejectedValue(makeNotFoundError());
      renderHook(() => useProjectInit());

      await waitFor(() => expect(mockCreateProject).toHaveBeenCalledOnce());
    });

    it('calls history.replaceState to set projectId in URL after creation', async () => {
      setUrlSearch('');
      mockCreateProject.mockResolvedValue({ projectId: 'new-project-abc' });
      mockFetchLatestVersion.mockRejectedValue(makeNotFoundError());
      const { result } = renderHook(() => useProjectInit());

      await waitFor(() => expect(result.current.status).toBe('ready'));
      expect(replaceStateSpy).toHaveBeenCalledOnce();
      const newUrl = String(replaceStateSpy.mock.calls[0]?.[2] ?? '');
      expect(newUrl).toContain('projectId=new-project-abc');
    });

    it('transitions to ready after create + hydration (404 fallback)', async () => {
      setUrlSearch('');
      mockCreateProject.mockResolvedValue({ projectId: 'new-project-abc' });
      mockFetchLatestVersion.mockRejectedValue(makeNotFoundError());
      const { result } = renderHook(() => useProjectInit());

      await waitFor(() => expect(result.current.status).toBe('ready'));
      expect(result.current.projectId).toBe('new-project-abc');
    });

    it('transitions to error state when createProject rejects', async () => {
      setUrlSearch('');
      mockCreateProject.mockRejectedValue(new Error('Network error'));
      const { result } = renderHook(() => useProjectInit());

      await waitFor(() => expect(result.current.status).toBe('error'));

      expect(result.current.projectId).toBeNull();
      if (result.current.status === 'error') {
        expect(result.current.error).toContain('Network error');
      }
    });

    it('uses "Unknown error creating project" when rejection value is not an Error', async () => {
      setUrlSearch('');
      mockCreateProject.mockRejectedValue('string-error');
      const { result } = renderHook(() => useProjectInit());

      await waitFor(() => expect(result.current.status).toBe('error'));

      if (result.current.status === 'error') {
        expect(result.current.error).toBe('Unknown error creating project');
      }
    });
  });
});
