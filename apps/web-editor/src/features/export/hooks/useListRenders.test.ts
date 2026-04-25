import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockListRenders } = vi.hoisted(() => ({
  mockListRenders: vi.fn(),
}));

vi.mock('@/features/export/api', () => ({
  listRenders: (...args: unknown[]) => mockListRenders(...args),
}));

import { useListRenders } from './useListRenders';
import type { RenderJob } from '@/features/export/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE_JOB: RenderJob = {
  jobId: 'job-001',
  projectId: 'proj-001',
  versionId: 5,
  status: 'queued',
  progressPct: 0,
  preset: { key: '1080p', width: 1920, height: 1080, fps: 30, format: 'mp4', codec: 'h264' },
  outputUri: null,
  errorMessage: null,
  createdAt: '2026-04-07T09:00:00.000Z',
  updatedAt: '2026-04-07T09:00:00.000Z',
};

const PROCESSING_JOB: RenderJob = { ...BASE_JOB, jobId: 'job-002', status: 'processing', progressPct: 40 };
const COMPLETE_JOB: RenderJob = { ...BASE_JOB, jobId: 'job-003', status: 'complete', progressPct: 100 };
const FAILED_JOB: RenderJob = { ...BASE_JOB, jobId: 'job-004', status: 'failed', errorMessage: 'Crash' };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useListRenders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Enabled / disabled based on projectId ─────────────────────────────────

  it('does not call listRenders when projectId is empty string', () => {
    mockListRenders.mockResolvedValue([]);
    renderHook(() => useListRenders(''), { wrapper: makeWrapper() });
    expect(mockListRenders).not.toHaveBeenCalled();
  });

  it('calls listRenders with the projectId when projectId is non-empty', async () => {
    mockListRenders.mockResolvedValue([]);
    renderHook(() => useListRenders('proj-001'), { wrapper: makeWrapper() });
    await waitFor(() => expect(mockListRenders).toHaveBeenCalledWith('proj-001'));
  });

  // ── Returns correct data ───────────────────────────────────────────────────

  it('returns an empty array before data loads', () => {
    mockListRenders.mockResolvedValue([]);
    const { result } = renderHook(() => useListRenders('proj-001'), { wrapper: makeWrapper() });
    expect(result.current.renders).toEqual([]);
  });

  it('returns renders from the API once loaded', async () => {
    mockListRenders.mockResolvedValue([BASE_JOB, PROCESSING_JOB]);
    const { result } = renderHook(() => useListRenders('proj-001'), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.renders).toHaveLength(2));
    expect(result.current.renders[0].jobId).toBe('job-001');
    expect(result.current.renders[1].jobId).toBe('job-002');
  });

  // ── activeCount ────────────────────────────────────────────────────────────

  it('returns activeCount 0 when no renders are loaded', () => {
    mockListRenders.mockResolvedValue([]);
    const { result } = renderHook(() => useListRenders('proj-001'), { wrapper: makeWrapper() });
    expect(result.current.activeCount).toBe(0);
  });

  it('returns activeCount matching queued + processing jobs', async () => {
    mockListRenders.mockResolvedValue([BASE_JOB, PROCESSING_JOB, COMPLETE_JOB, FAILED_JOB]);
    const { result } = renderHook(() => useListRenders('proj-001'), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.renders).toHaveLength(4));
    // BASE_JOB is queued, PROCESSING_JOB is processing → activeCount = 2
    expect(result.current.activeCount).toBe(2);
  });

  it('returns activeCount 0 when all jobs are in terminal states', async () => {
    mockListRenders.mockResolvedValue([COMPLETE_JOB, FAILED_JOB]);
    const { result } = renderHook(() => useListRenders('proj-001'), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.renders).toHaveLength(2));
    expect(result.current.activeCount).toBe(0);
  });

  it('returns activeCount 1 when exactly one job is queued', async () => {
    mockListRenders.mockResolvedValue([BASE_JOB, COMPLETE_JOB]);
    const { result } = renderHook(() => useListRenders('proj-001'), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.renders).toHaveLength(2));
    expect(result.current.activeCount).toBe(1);
  });

  // ── isLoading ──────────────────────────────────────────────────────────────

  it('returns isLoading: true initially when projectId is non-empty', () => {
    mockListRenders.mockResolvedValue([]);
    const { result } = renderHook(() => useListRenders('proj-001'), { wrapper: makeWrapper() });
    expect(result.current.isLoading).toBe(true);
  });

  it('returns isLoading: false when projectId is empty string', () => {
    mockListRenders.mockResolvedValue([]);
    const { result } = renderHook(() => useListRenders(''), { wrapper: makeWrapper() });
    // Disabled query never shows loading
    expect(result.current.isLoading).toBe(false);
  });

  // ── Error handling ─────────────────────────────────────────────────────────

  it('returns an Error when listRenders throws', async () => {
    mockListRenders.mockRejectedValue(new Error('Network failure'));
    const { result } = renderHook(() => useListRenders('proj-001'), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error?.message).toBe('Network failure');
  });

  it('returns null error on successful fetch', async () => {
    mockListRenders.mockResolvedValue([BASE_JOB]);
    const { result } = renderHook(() => useListRenders('proj-001'), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.renders).toHaveLength(1));
    expect(result.current.error).toBeNull();
  });
});
