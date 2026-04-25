/**
 * useProjects — tests.
 *
 * Covers: query-key stability, successful fetch, error surfacing.
 */

import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — vi.hoisted ensures refs are available when factory runs (§10 rule)
// ---------------------------------------------------------------------------

const { mockListProjects } = vi.hoisted(() => ({
  mockListProjects: vi.fn(),
}));

vi.mock('@/features/home/api', () => ({
  listProjects: mockListProjects,
  createProject: vi.fn(),
}));

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useProjects } from './useProjects';
import type { ProjectSummary } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWrapper(): React.FC<{ children: React.ReactNode }> {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
}

const SAMPLE_PROJECTS: ProjectSummary[] = [
  {
    projectId: 'proj-1',
    title: 'My Project',
    updatedAt: new Date().toISOString(),
    thumbnailUrl: null,
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useProjects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should start in loading state before the query resolves', () => {
    mockListProjects.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useProjects(), {
      wrapper: makeWrapper(),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.isError).toBe(false);
    expect(result.current.data).toBeUndefined();
  });

  it('should return project data on successful fetch', async () => {
    mockListProjects.mockResolvedValue(SAMPLE_PROJECTS);

    const { result } = renderHook(() => useProjects(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isError).toBe(false);
    expect(result.current.data).toEqual(SAMPLE_PROJECTS);
  });

  it('should surface isError=true when listProjects throws', async () => {
    mockListProjects.mockRejectedValue(new Error('network error'));

    const { result } = renderHook(() => useProjects(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isError).toBe(true);
    expect(result.current.data).toBeUndefined();
  });

  it('should use a stable query key [home, projects] across multiple renders', () => {
    mockListProjects.mockResolvedValue(SAMPLE_PROJECTS);

    // Render and capture how many times listProjects is called —
    // subsequent renders with the same wrapper/client must NOT call the queryFn again
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) =>
      React.createElement(QueryClientProvider, { client }, children);

    const { rerender } = renderHook(() => useProjects(), { wrapper });
    rerender();
    rerender();

    // listProjects is only called once despite multiple renders
    expect(mockListProjects).toHaveBeenCalledTimes(1);
  });

  it('should return empty array when server returns empty list', async () => {
    mockListProjects.mockResolvedValue([]);

    const { result } = renderHook(() => useProjects(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toEqual([]);
  });
});
