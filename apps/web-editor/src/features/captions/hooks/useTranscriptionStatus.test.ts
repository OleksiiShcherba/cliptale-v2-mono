import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useTranscriptionStatus } from './useTranscriptionStatus';
import * as captionsApi from '@/features/captions/api';

vi.mock('@/features/captions/api');

const mockGetCaptions = vi.mocked(captionsApi.getCaptions);

const TEST_SEGMENTS = [
  { start: 0.0, end: 2.5, text: 'Hello world' },
  { start: 2.5, end: 5.0, text: 'Another line' },
];

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
      },
    },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }): React.ReactElement =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return { queryClient, Wrapper };
}

describe('useTranscriptionStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns idle when getCaptions returns null (404 — not yet transcribed)', async () => {
    mockGetCaptions.mockResolvedValue(null);
    const { Wrapper } = createWrapper();

    const { result } = renderHook(
      () => useTranscriptionStatus('asset-001'),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.status).toBe('idle'));
    expect(result.current.segments).toBeNull();
  });

  it('returns ready with segments when getCaptions returns data', async () => {
    mockGetCaptions.mockResolvedValue({ segments: TEST_SEGMENTS });
    const { Wrapper } = createWrapper();

    const { result } = renderHook(
      () => useTranscriptionStatus('asset-001'),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.segments).toEqual(TEST_SEGMENTS);
  });

  it('returns error when getCaptions throws', async () => {
    mockGetCaptions.mockRejectedValue(new Error('Server error 500'));
    const { Wrapper } = createWrapper();

    const { result } = renderHook(
      () => useTranscriptionStatus('asset-001'),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.segments).toBeNull();
  });

  it('does not call getCaptions when assetId is null', async () => {
    const { Wrapper } = createWrapper();

    const { result } = renderHook(
      () => useTranscriptionStatus(null),
      { wrapper: Wrapper },
    );

    await new Promise((r) => setTimeout(r, 50));

    expect(mockGetCaptions).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
    expect(result.current.segments).toBeNull();
  });

  it('calls getCaptions with the provided assetId', async () => {
    mockGetCaptions.mockResolvedValue(null);
    const { Wrapper } = createWrapper();

    renderHook(
      () => useTranscriptionStatus('asset-xyz'),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(mockGetCaptions).toHaveBeenCalledWith('asset-xyz'));
  });

  it('transitions to ready when query data is updated (simulates poll completing)', async () => {
    mockGetCaptions.mockResolvedValueOnce(null);
    const { Wrapper, queryClient } = createWrapper();

    const { result } = renderHook(
      () => useTranscriptionStatus('asset-001'),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.status).toBe('idle'));

    // Simulate a successful poll completing — update the cache directly.
    mockGetCaptions.mockResolvedValue({ segments: TEST_SEGMENTS });
    await queryClient.refetchQueries({ queryKey: ['captions', 'asset-001'] });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.segments).toEqual(TEST_SEGMENTS);
  });

  it('exposes isFetching=true while the initial query is in-flight', () => {
    mockGetCaptions.mockReturnValue(new Promise(() => undefined));
    const { Wrapper } = createWrapper();

    const { result } = renderHook(
      () => useTranscriptionStatus('asset-001'),
      { wrapper: Wrapper },
    );

    expect(result.current.isFetching).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // pollingEnabled parameter
  // ---------------------------------------------------------------------------

  it('always performs an initial fetch regardless of pollingEnabled=false', async () => {
    mockGetCaptions.mockResolvedValue(null);
    const { Wrapper } = createWrapper();

    renderHook(
      () => useTranscriptionStatus('asset-001', false),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(mockGetCaptions).toHaveBeenCalledWith('asset-001'));
  });

  it('also performs an initial fetch when pollingEnabled=true', async () => {
    mockGetCaptions.mockResolvedValue(null);
    const { Wrapper } = createWrapper();

    renderHook(
      () => useTranscriptionStatus('asset-001', true),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(mockGetCaptions).toHaveBeenCalledWith('asset-001'));
  });

  it('transitions through idle when pollingEnabled=false (no continuous poll)', async () => {
    // When pollingEnabled is false and data is null, status stays idle (no retry loop).
    mockGetCaptions.mockResolvedValue(null);
    const { Wrapper } = createWrapper();

    const { result } = renderHook(
      () => useTranscriptionStatus('asset-001', false),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.status).toBe('idle'));
    // Only one call — no polling interval fired.
    expect(mockGetCaptions).toHaveBeenCalledTimes(1);
  });

  it('returns ready immediately when pollingEnabled=true and captions already exist', async () => {
    mockGetCaptions.mockResolvedValue({ segments: TEST_SEGMENTS });
    const { Wrapper } = createWrapper();

    const { result } = renderHook(
      () => useTranscriptionStatus('asset-001', true),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.segments).toEqual(TEST_SEGMENTS);
  });
});
