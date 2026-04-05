import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Mocks — vi.hoisted() ensures these are initialized before vi.mock factories run
// ---------------------------------------------------------------------------

const { mockCreateRender, mockGetRenderStatus } = vi.hoisted(() => ({
  mockCreateRender: vi.fn(),
  mockGetRenderStatus: vi.fn(),
}));

vi.mock('@/features/export/api', () => ({
  createRender: (...args: unknown[]) => mockCreateRender(...args),
  getRenderStatus: (...args: unknown[]) => mockGetRenderStatus(...args),
}));


import { useExportRender } from './useExportRender';
import type { RenderJob } from '@/features/export/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const QUEUED_JOB: RenderJob = {
  jobId: 'job-abc-123',
  projectId: 'test-project-001',
  versionId: 42,
  status: 'queued',
  progressPct: 0,
  preset: { key: '1080p', width: 1920, height: 1080, fps: 30, format: 'mp4', codec: 'h264' },
  outputUri: null,
  errorMessage: null,
  createdAt: '2026-04-04T10:00:00.000Z',
  updatedAt: '2026-04-04T10:00:00.000Z',
};

const COMPLETE_JOB: RenderJob = {
  ...QUEUED_JOB,
  status: 'complete',
  progressPct: 100,
  outputUri: 's3://test-bucket/renders/job-abc-123.mp4',
  downloadUrl: 'https://example.com/signed-download-url',
};

const FAILED_JOB: RenderJob = {
  ...QUEUED_JOB,
  status: 'failed',
  errorMessage: 'FFmpeg crash',
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
        // Disable automatic refetching in tests to keep polling deterministic.
        refetchInterval: false,
      },
    },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }): React.ReactElement =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return { queryClient, Wrapper };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useExportRender', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Initial state ──────────────────────────────────────────────────────────

  it('returns initial state with null activeJobId and no error', () => {
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useExportRender(42, 'test-project-001'), { wrapper: Wrapper });

    expect(result.current.activeJobId).toBeNull();
    expect(result.current.isSubmitting).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.activeJob).toBeUndefined();
  });

  // ── startRender — happy path ───────────────────────────────────────────────

  it('sets activeJobId after a successful startRender call', async () => {
    mockCreateRender.mockResolvedValueOnce({ jobId: 'job-abc-123', status: 'queued' });
    mockGetRenderStatus.mockResolvedValue(QUEUED_JOB);

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useExportRender(42, 'test-project-001'), { wrapper: Wrapper });

    await act(async () => {
      await result.current.startRender('1080p');
    });

    expect(result.current.activeJobId).toBe('job-abc-123');
    expect(result.current.isSubmitting).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('calls createRender with correct projectId, versionId, and presetKey', async () => {
    mockCreateRender.mockResolvedValueOnce({ jobId: 'job-abc-123', status: 'queued' });
    mockGetRenderStatus.mockResolvedValue(QUEUED_JOB);

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useExportRender(42, 'test-project-001'), { wrapper: Wrapper });

    await act(async () => {
      await result.current.startRender('720p');
    });

    expect(mockCreateRender).toHaveBeenCalledWith('test-project-001', 42, '720p');
  });

  it('sets isSubmitting to true while the request is in-flight', async () => {
    let resolveCreate!: (value: { jobId: string; status: 'queued' }) => void;
    const pending = new Promise<{ jobId: string; status: 'queued' }>((resolve) => {
      resolveCreate = resolve;
    });
    mockCreateRender.mockReturnValueOnce(pending);

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useExportRender(42, 'test-project-001'), { wrapper: Wrapper });

    act(() => {
      void result.current.startRender('1080p');
    });

    expect(result.current.isSubmitting).toBe(true);

    await act(async () => {
      resolveCreate({ jobId: 'job-abc-123', status: 'queued' });
    });

    expect(result.current.isSubmitting).toBe(false);
  });

  // ── startRender — error path ───────────────────────────────────────────────

  it('sets error when createRender throws', async () => {
    mockCreateRender.mockRejectedValueOnce(new Error('Server error'));

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useExportRender(42, 'test-project-001'), { wrapper: Wrapper });

    await act(async () => {
      await result.current.startRender('1080p');
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('Server error');
    expect(result.current.activeJobId).toBeNull();
    expect(result.current.isSubmitting).toBe(false);
  });

  // ── activeJob polling ──────────────────────────────────────────────────────

  it('exposes activeJob data after polling resolves', async () => {
    mockCreateRender.mockResolvedValueOnce({ jobId: 'job-abc-123', status: 'queued' });
    mockGetRenderStatus.mockResolvedValue(QUEUED_JOB);

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useExportRender(42, 'test-project-001'), { wrapper: Wrapper });

    await act(async () => {
      await result.current.startRender('1080p');
    });

    await waitFor(() => expect(result.current.activeJob).toBeDefined());
    expect(result.current.activeJob?.jobId).toBe('job-abc-123');
    expect(result.current.activeJob?.status).toBe('queued');
  });

  it('exposes downloadUrl when activeJob status is complete', async () => {
    mockCreateRender.mockResolvedValueOnce({ jobId: 'job-abc-123', status: 'queued' });
    mockGetRenderStatus.mockResolvedValue(COMPLETE_JOB);

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useExportRender(42, 'test-project-001'), { wrapper: Wrapper });

    await act(async () => {
      await result.current.startRender('1080p');
    });

    await waitFor(() => expect(result.current.activeJob?.status).toBe('complete'));
    expect(result.current.activeJob?.downloadUrl).toBe('https://example.com/signed-download-url');
  });

  // ── reset ──────────────────────────────────────────────────────────────────

  it('resets all state when reset() is called', async () => {
    mockCreateRender.mockResolvedValueOnce({ jobId: 'job-abc-123', status: 'queued' });
    mockGetRenderStatus.mockResolvedValue(QUEUED_JOB);

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useExportRender(42, 'test-project-001'), { wrapper: Wrapper });

    await act(async () => {
      await result.current.startRender('1080p');
    });

    expect(result.current.activeJobId).toBe('job-abc-123');

    act(() => {
      result.current.reset();
    });

    expect(result.current.activeJobId).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.isSubmitting).toBe(false);
  });

  it('clears error when reset() is called after a failed submit', async () => {
    mockCreateRender.mockRejectedValueOnce(new Error('quota exceeded'));

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useExportRender(42, 'test-project-001'), { wrapper: Wrapper });

    await act(async () => {
      await result.current.startRender('1080p');
    });

    expect(result.current.error?.message).toBe('quota exceeded');

    act(() => {
      result.current.reset();
    });

    expect(result.current.error).toBeNull();
  });

  // ── failed job ────────────────────────────────────────────────────────────

  it('exposes the errorMessage when job status is failed', async () => {
    mockCreateRender.mockResolvedValueOnce({ jobId: 'job-abc-123', status: 'queued' });
    mockGetRenderStatus.mockResolvedValue(FAILED_JOB);

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useExportRender(42, 'test-project-001'), { wrapper: Wrapper });

    await act(async () => {
      await result.current.startRender('1080p');
    });

    await waitFor(() => expect(result.current.activeJob?.status).toBe('failed'));
    expect(result.current.activeJob?.errorMessage).toBe('FFmpeg crash');
  });
});
