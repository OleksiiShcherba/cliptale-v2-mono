import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import React from 'react';

import type { UserVoice } from '@/features/ai-generation/types';

const { mockListUserVoices } = vi.hoisted(() => ({
  mockListUserVoices: vi.fn(),
}));

vi.mock('@/features/ai-generation/api', () => ({
  listUserVoices: mockListUserVoices,
}));

import { useUserVoices } from './useUserVoices';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const USER_VOICE: UserVoice = {
  voiceId: 'uv-001',
  userId: 'user-1',
  label: 'My Voice',
  elevenLabsVoiceId: 'el-001',
  createdAt: '2026-01-01T00:00:00.000Z',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useUserVoices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns isLoading true while the query is in-flight', () => {
    mockListUserVoices.mockReturnValue(new Promise(() => undefined));
    const { result } = renderHook(() => useUserVoices(), { wrapper: makeWrapper() });
    expect(result.current.isLoading).toBe(true);
    expect(result.current.userVoices).toEqual([]);
  });

  it('returns voices after successful fetch', async () => {
    mockListUserVoices.mockResolvedValue([USER_VOICE]);
    const { result } = renderHook(() => useUserVoices(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.userVoices).toEqual([USER_VOICE]);
    expect(result.current.isError).toBe(false);
  });

  it('returns empty array on successful fetch with no voices', async () => {
    mockListUserVoices.mockResolvedValue([]);
    const { result } = renderHook(() => useUserVoices(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.userVoices).toEqual([]);
  });

  it('returns isError true when the fetch fails', async () => {
    mockListUserVoices.mockRejectedValue(new Error('Network error'));
    const { result } = renderHook(() => useUserVoices(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.userVoices).toEqual([]);
  });
});
