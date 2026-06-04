/**
 * useFlowGeneration — orchestration hook tests (T20).
 *
 * Covers the spend-bearing Generate UX matrix:
 *   - AC-11: cancel → NO generate call, NO charge
 *   - AC-01: confirm → runs Generate with an Idempotency-Key, then tracks progress
 *   - AC-12/AC-13: the idempotency key is STABLE across estimate→confirm of one press
 *   - AC-08b: reopen reattaches to a running job (seeded from the flow's JobState)
 *   - AC-08b: reopen shows last-known done / failed state
 *   - AC-09: a failed run → retry issues a FRESH Generate with a NEW Idempotency-Key
 *
 * useJobPolling is mocked so we drive job state directly; api.ts is mocked so we
 * assert estimate/generate calls + that cancel makes none.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

import type { AiGenerationJob } from '@/shared/ai-generation/types';

const { mockEstimate, mockGenerate } = vi.hoisted(() => ({
  mockEstimate: vi.fn(),
  mockGenerate: vi.fn(),
}));

vi.mock('@/features/generate-ai-flow/api', () => ({
  estimateGeneration: mockEstimate,
  generateBlock: mockGenerate,
}));

// useJobPolling is mocked to return whatever the test stages via setPollingJob.
const { pollingState } = vi.hoisted(() => ({
  pollingState: { calls: [] as Array<{ jobId: string | null; initial: AiGenerationJob | null }>, job: null as AiGenerationJob | null },
}));

vi.mock('@/shared/ai-generation/hooks/useJobPolling', () => ({
  useJobPolling: (jobId: string | null, initial: AiGenerationJob | null = null) => {
    pollingState.calls.push({ jobId, initial });
    // Seed from the initial job when no live job has been driven.
    return { job: pollingState.job ?? initial, isPolling: jobId != null };
  },
}));

import { useFlowGeneration } from './useFlowGeneration';
import type { JobState } from '../types';

const ESTIMATE = {
  flowId: 'f1',
  blockId: 'b1',
  modelId: 'fal-ai/x',
  estimate: { currency: 'USD', amount: 0.42 },
  bestEffort: true as const,
};

beforeEach(() => {
  mockEstimate.mockReset();
  mockGenerate.mockReset();
  pollingState.calls = [];
  pollingState.job = null;
});

function setup(initialJobState: JobState | null = null) {
  return renderHook(() =>
    useFlowGeneration({ flowId: 'f1', blockId: 'b1', version: 7, initialJobState }),
  );
}

describe('useFlowGeneration — estimate → confirm gate', () => {
  it('cancel makes NO generate call and NO charge (AC-11)', async () => {
    mockEstimate.mockResolvedValue(ESTIMATE);
    const { result } = setup();

    await act(async () => {
      await result.current.start();
    });
    expect(result.current.phase).toBe('confirming');
    expect(result.current.estimate).toEqual(ESTIMATE);

    act(() => {
      result.current.cancel();
    });

    expect(mockGenerate).not.toHaveBeenCalled();
    expect(result.current.phase).toBe('idle');
  });

  it('confirm runs Generate with an Idempotency-Key then tracks progress (AC-01)', async () => {
    mockEstimate.mockResolvedValue(ESTIMATE);
    mockGenerate.mockResolvedValue({ jobId: 'job-1', blockId: 'b1', status: 'queued' });
    const { result } = setup();

    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      await result.current.confirm();
    });

    expect(mockGenerate).toHaveBeenCalledTimes(1);
    const arg = mockGenerate.mock.calls[0][2];
    expect(arg.idempotencyKey).toBeTruthy();
    expect(arg.version).toBe(7);
    expect(result.current.phase).toBe('tracking');
    // the new job id is now polled
    expect(pollingState.calls.some((c) => c.jobId === 'job-1')).toBe(true);
  });

  it('keeps the SAME Idempotency-Key across the confirm step of one press', async () => {
    mockEstimate.mockResolvedValue(ESTIMATE);
    mockGenerate.mockResolvedValue({ jobId: 'job-1', blockId: 'b1', status: 'queued' });
    const { result } = setup();

    await act(async () => {
      await result.current.start();
    });
    const keyAfterStart = result.current.idempotencyKey;
    await act(async () => {
      await result.current.confirm();
    });
    expect(mockGenerate.mock.calls[0][2].idempotencyKey).toBe(keyAfterStart);
  });
});

describe('useFlowGeneration — reattach (AC-08b)', () => {
  it('reattaches polling to a running job seeded from the flow JobState', () => {
    const running: JobState = {
      jobId: 'job-running',
      blockId: 'b1',
      // verbatim the DB enum (migration 014) — the controller does not remap it
      status: 'processing',
      progress: 40,
      outputFileId: null,
      resultUrl: null,
      errorMessage: null,
    };
    setup(running);

    // polling was started with the running job's id, status passed through verbatim
    const call = pollingState.calls.find((c) => c.jobId === 'job-running');
    expect(call).toBeTruthy();
    expect(call?.initial?.status).toBe('processing');
    expect(call?.initial?.progress).toBe(40);
  });

  it('shows last-known DONE state on reopen', () => {
    pollingState.job = null;
    const done: JobState = {
      jobId: 'job-done',
      blockId: 'b1',
      // verbatim the DB enum (migration 014) — the controller does not remap it
      status: 'completed',
      progress: 100,
      outputFileId: 'file-9',
      resultUrl: 'https://cdn/x.png',
      errorMessage: null,
    };
    const { result } = setup(done);
    expect(result.current.job?.status).toBe('completed');
    expect(result.current.job?.resultAssetId).toBe('file-9');
  });

  it('shows last-known FAILED state on reopen', () => {
    const failed: JobState = {
      jobId: 'job-failed',
      blockId: 'b1',
      status: 'failed',
      progress: 0,
      outputFileId: null,
      resultUrl: null,
      errorMessage: 'provider exploded',
    };
    const { result } = setup(failed);
    expect(result.current.job?.status).toBe('failed');
    expect(result.current.job?.errorMessage).toBe('provider exploded');
  });
});

describe('useFlowGeneration — retry (AC-09)', () => {
  it('retry issues a FRESH Generate with a NEW Idempotency-Key', async () => {
    mockEstimate.mockResolvedValue(ESTIMATE);
    mockGenerate.mockResolvedValue({ jobId: 'job-1', blockId: 'b1', status: 'queued' });
    const { result } = setup();

    // first run
    await act(async () => {
      await result.current.start();
    });
    const firstKey = result.current.idempotencyKey;
    await act(async () => {
      await result.current.confirm();
    });

    // retry: fresh estimate → confirm with a NEW key
    await act(async () => {
      await result.current.retry();
    });
    const retryKey = result.current.idempotencyKey;
    expect(retryKey).not.toBe(firstKey);
    expect(mockEstimate).toHaveBeenCalledTimes(2);

    await act(async () => {
      await result.current.confirm();
    });
    expect(mockGenerate).toHaveBeenCalledTimes(2);
    expect(mockGenerate.mock.calls[1][2].idempotencyKey).toBe(retryKey);
    expect(mockGenerate.mock.calls[1][2].idempotencyKey).not.toBe(firstKey);
  });
});
