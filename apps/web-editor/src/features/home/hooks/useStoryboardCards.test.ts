/**
 * useStoryboardCards — tests.
 *
 * Covers: query-key stability, successful fetch, error surfacing.
 */

import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — vi.hoisted ensures refs are available when factory runs (§10 rule)
// ---------------------------------------------------------------------------

const { mockListStoryboardCards } = vi.hoisted(() => ({
  mockListStoryboardCards: vi.fn(),
}));

vi.mock('@/features/home/api', () => ({
  listProjects: vi.fn(),
  createProject: vi.fn(),
  listStoryboardCards: mockListStoryboardCards,
}));

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useStoryboardCards } from './useStoryboardCards';
import type { StoryboardCardSummary } from '../types';

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

const SAMPLE_CARDS: StoryboardCardSummary[] = [
  {
    draftId: 'draft-1',
    status: 'draft',
    textPreview: 'A dramatic opening scene',
    mediaPreviews: [],
    updatedAt: new Date().toISOString(),
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useStoryboardCards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should start in loading state before the query resolves', () => {
    mockListStoryboardCards.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useStoryboardCards(), {
      wrapper: makeWrapper(),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.isError).toBe(false);
    expect(result.current.data).toBeUndefined();
  });

  it('should return card data on successful fetch', async () => {
    mockListStoryboardCards.mockResolvedValue(SAMPLE_CARDS);

    const { result } = renderHook(() => useStoryboardCards(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isError).toBe(false);
    expect(result.current.data).toEqual(SAMPLE_CARDS);
  });

  it('should surface isError=true when listStoryboardCards throws', async () => {
    mockListStoryboardCards.mockRejectedValue(new Error('network error'));

    const { result } = renderHook(() => useStoryboardCards(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isError).toBe(true);
    expect(result.current.data).toBeUndefined();
  });

  it('should use a stable query key [home, storyboards] across multiple renders', () => {
    mockListStoryboardCards.mockResolvedValue(SAMPLE_CARDS);

    // Render multiple times with the same client — queryFn must only be called once
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) =>
      React.createElement(QueryClientProvider, { client }, children);

    const { rerender } = renderHook(() => useStoryboardCards(), { wrapper });
    rerender();
    rerender();

    // listStoryboardCards is only called once despite multiple renders
    expect(mockListStoryboardCards).toHaveBeenCalledTimes(1);
  });

  it('should return empty array when server returns empty list', async () => {
    mockListStoryboardCards.mockResolvedValue([]);

    const { result } = renderHook(() => useStoryboardCards(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toEqual([]);
  });
});
