import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/features/project/api', () => ({
  createProject: vi.fn(),
}));

import * as projectApi from '@/features/project/api';
import { useProjectInit } from './useProjectInit';

const mockCreateProject = vi.mocked(projectApi.createProject);

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Replaces window.location with a given search string for the duration of a test. */
function setUrlSearch(search: string): void {
  Object.defineProperty(window, 'location', {
    writable: true,
    value: { ...window.location, href: `http://localhost/${search}`, search },
  });
}

// Capture history.replaceState calls
const replaceStateSpy = vi.spyOn(window.history, 'replaceState');

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useProjectInit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    replaceStateSpy.mockImplementation(() => {});
  });

  afterEach(() => {
    setUrlSearch('');
  });

  describe('when projectId is present in the URL', () => {
    it('returns status ready immediately with the URL project ID', () => {
      setUrlSearch('?projectId=url-project-123');
      const { result } = renderHook(() => useProjectInit());
      expect(result.current.status).toBe('ready');
      expect(result.current.projectId).toBe('url-project-123');
    });

    it('does NOT call createProject when URL has projectId', () => {
      setUrlSearch('?projectId=url-project-123');
      renderHook(() => useProjectInit());
      expect(mockCreateProject).not.toHaveBeenCalled();
    });

    it('does NOT call history.replaceState when URL already has projectId', () => {
      setUrlSearch('?projectId=url-project-123');
      renderHook(() => useProjectInit());
      expect(replaceStateSpy).not.toHaveBeenCalled();
    });
  });

  describe('when no projectId is in the URL', () => {
    it('starts in loading state when no URL projectId', () => {
      setUrlSearch('');
      mockCreateProject.mockResolvedValue({ projectId: 'new-project-abc' });
      const { result } = renderHook(() => useProjectInit());
      expect(result.current.status).toBe('loading');
      expect(result.current.projectId).toBeNull();
    });

    it('transitions to ready with the created projectId', async () => {
      setUrlSearch('');
      mockCreateProject.mockResolvedValue({ projectId: 'new-project-abc' });
      const { result } = renderHook(() => useProjectInit());

      await waitFor(() => {
        expect(result.current.status).toBe('ready');
      });

      expect(result.current.projectId).toBe('new-project-abc');
    });

    it('calls history.replaceState to set projectId in URL after creation', async () => {
      setUrlSearch('');
      mockCreateProject.mockResolvedValue({ projectId: 'new-project-abc' });
      renderHook(() => useProjectInit());

      await waitFor(() => {
        expect(replaceStateSpy).toHaveBeenCalledOnce();
      });

      const newUrl = String(replaceStateSpy.mock.calls[0]?.[2] ?? '');
      expect(newUrl).toContain('projectId=new-project-abc');
    });

    it('calls createProject exactly once', async () => {
      setUrlSearch('');
      mockCreateProject.mockResolvedValue({ projectId: 'proj-xyz' });
      renderHook(() => useProjectInit());

      await waitFor(() => expect(mockCreateProject).toHaveBeenCalledOnce());
    });

    it('transitions to error state when createProject rejects', async () => {
      setUrlSearch('');
      mockCreateProject.mockRejectedValue(new Error('Network error'));
      const { result } = renderHook(() => useProjectInit());

      await waitFor(() => {
        expect(result.current.status).toBe('error');
      });

      expect(result.current.projectId).toBeNull();
      if (result.current.status === 'error') {
        expect(result.current.error).toContain('Network error');
      }
    });

    it('uses "Unknown error creating project" when rejection value is not an Error', async () => {
      setUrlSearch('');
      mockCreateProject.mockRejectedValue('string-error');
      const { result } = renderHook(() => useProjectInit());

      await waitFor(() => {
        expect(result.current.status).toBe('error');
      });

      if (result.current.status === 'error') {
        expect(result.current.error).toBe('Unknown error creating project');
      }
    });
  });
});
