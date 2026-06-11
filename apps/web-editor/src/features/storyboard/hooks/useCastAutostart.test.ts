/**
 * useCastAutostart — hook tests (reference-generation-autostart T5, AC-01, AC-05).
 *
 * AC-01 (silent auto-start):
 *   Given a draft with no existing cast extraction,
 *   When the hook mounts,
 *   Then it issues exactly one silent start (one POST) and nothing else.
 *
 * AC-05 (one extraction per draft / in-flight guard):
 *   Given a draft that already has an extraction (running or completed),
 *   When the hook mounts, Then it issues no start.
 *   And a re-mount while a start is still in flight issues no second POST.
 *
 * Polling: the query polls on the 3s interval while non-terminal
 *   (queued/running) and stops once terminal (completed/failed) or absent.
 *
 * Level: unit (per test-plan AC-01/AC-05 rows — hook in isolation).
 */

import { createElement, type ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ── Hoisted api mocks ──────────────────────────────────────────────────────────

const hoisted = vi.hoisted(() => ({
  mockStartCastExtraction: vi.fn(),
  mockGetLatestCastExtraction: vi.fn(),
}));

vi.mock('@/features/storyboard/api', () => ({
  startCastExtraction: hoisted.mockStartCastExtraction,
  getLatestCastExtraction: hoisted.mockGetLatestCastExtraction,
}));

// The not-yet-written hook — import resolves only once T5 creates the module.
import {
  useCastAutostart,
  castPollInterval,
  __resetCastAutostartGuard,
} from './useCastAutostart';
import type { CastExtractionJob } from '../components/CastConfirmModal';

// ── Fixtures ────────────────────────────────────────────────────────────────

function freshClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

function makeWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children);
  };
}

function runningJob(draftId: string): CastExtractionJob {
  return {
    jobId: 'job-running',
    draftId,
    status: 'running',
    proposal: null,
    aggregateEstimateCredits: null,
    errorMessage: null,
  };
}

beforeEach(() => {
  hoisted.mockStartCastExtraction.mockReset();
  hoisted.mockGetLatestCastExtraction.mockReset();
  __resetCastAutostartGuard();
});

// ── AC-01: silent auto-start when none exists ──────────────────────────────────

describe('useCastAutostart — AC-01 (silent auto-start when none exists)', () => {
  it('issues exactly one start when the draft has no existing extraction', async () => {
    const DRAFT = 'draft-auto';
    hoisted.mockGetLatestCastExtraction.mockResolvedValue(null);
    hoisted.mockStartCastExtraction.mockResolvedValue({ jobId: 'new', status: 'queued' });

    renderHook(() => useCastAutostart(DRAFT), { wrapper: makeWrapper(freshClient()) });

    await waitFor(() => {
      expect(hoisted.mockStartCastExtraction).toHaveBeenCalledTimes(1);
    });
    expect(hoisted.mockStartCastExtraction).toHaveBeenCalledWith(DRAFT);
  });
});

// ── AC-05: no second start when one exists + in-flight guard ────────────────────

describe('useCastAutostart — AC-05 (one extraction per draft)', () => {
  it('issues no start when the draft already has an extraction', async () => {
    const DRAFT = 'draft-existing';
    hoisted.mockGetLatestCastExtraction.mockResolvedValue(runningJob(DRAFT));

    const { result } = renderHook(() => useCastAutostart(DRAFT), {
      wrapper: makeWrapper(freshClient()),
    });

    await waitFor(() => {
      expect(result.current.data).toEqual(runningJob(DRAFT));
    });
    expect(hoisted.mockStartCastExtraction).not.toHaveBeenCalled();
  });

  it('in-flight guard: a re-mount while the start is pending issues no second POST', async () => {
    const DRAFT = 'draft-inflight';
    hoisted.mockGetLatestCastExtraction.mockResolvedValue(null);
    // Start stays pending → the draft remains "in flight".
    let resolveStart!: (v: { jobId: string; status: 'queued' }) => void;
    hoisted.mockStartCastExtraction.mockImplementation(
      () => new Promise((res) => { resolveStart = res; }),
    );

    const wrapper = makeWrapper(freshClient());
    const first = renderHook(() => useCastAutostart(DRAFT), { wrapper });
    await waitFor(() => expect(hoisted.mockStartCastExtraction).toHaveBeenCalledTimes(1));

    // Re-mount the hook while the start is still pending.
    first.unmount();
    renderHook(() => useCastAutostart(DRAFT), { wrapper });
    await new Promise((r) => setTimeout(r, 10));

    expect(hoisted.mockStartCastExtraction).toHaveBeenCalledTimes(1);
    resolveStart({ jobId: 'new', status: 'queued' });
  });
});

// ── Polling cadence — stops on terminal status ──────────────────────────────────

describe('castPollInterval — polling stops on terminal status', () => {
  it('does not poll when there is no extraction yet', () => {
    expect(castPollInterval(null)).toBe(false);
    expect(castPollInterval(undefined)).toBe(false);
  });

  it('polls on the 3s interval while queued or running', () => {
    expect(castPollInterval(runningJob('d'))).toBe(3000);
    expect(castPollInterval({ ...runningJob('d'), status: 'queued' })).toBe(3000);
  });

  it('stops polling (false) on a terminal status', () => {
    expect(castPollInterval({ ...runningJob('d'), status: 'completed' })).toBe(false);
    expect(castPollInterval({ ...runningJob('d'), status: 'failed' })).toBe(false);
  });
});
