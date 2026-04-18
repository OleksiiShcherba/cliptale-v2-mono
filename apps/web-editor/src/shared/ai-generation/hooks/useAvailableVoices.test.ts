import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import React from 'react';

import type { ElevenLabsVoice } from '@/shared/ai-generation/types';

const { mockListAvailableVoices } = vi.hoisted(() => ({
  mockListAvailableVoices: vi.fn(),
}));

vi.mock('@/shared/ai-generation/api', () => ({
  listAvailableVoices: mockListAvailableVoices,
}));

import { useAvailableVoices } from './useAvailableVoices';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const LIBRARY_VOICE: ElevenLabsVoice = {
  voiceId: 'pNInz6obpgDQGcFmaJgB',
  name: 'Adam',
  category: 'premade',
  description: null,
  previewUrl: 'https://cdn.elevenlabs.io/adam.mp3',
  labels: { gender: 'male' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useAvailableVoices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns isLoading true while the query is in-flight', () => {
    mockListAvailableVoices.mockReturnValue(new Promise(() => undefined));
    const { result } = renderHook(() => useAvailableVoices(), { wrapper: makeWrapper() });
    expect(result.current.isLoading).toBe(true);
    expect(result.current.libraryVoices).toEqual([]);
  });

  it('returns voices after successful fetch', async () => {
    mockListAvailableVoices.mockResolvedValue([LIBRARY_VOICE]);
    const { result } = renderHook(() => useAvailableVoices(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.libraryVoices).toEqual([LIBRARY_VOICE]);
    expect(result.current.isError).toBe(false);
  });

  it('returns empty array on successful fetch with no voices', async () => {
    mockListAvailableVoices.mockResolvedValue([]);
    const { result } = renderHook(() => useAvailableVoices(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.libraryVoices).toEqual([]);
  });

  it('returns isError true when the fetch fails', async () => {
    mockListAvailableVoices.mockRejectedValue(new Error('Network error'));
    const { result } = renderHook(() => useAvailableVoices(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.libraryVoices).toEqual([]);
  });
});
