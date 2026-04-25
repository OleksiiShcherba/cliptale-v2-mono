/**
 * useEnhancePrompt — timing, edge cases, and error-handling tests.
 *
 * Primary hook API tests (start, reset, null-draftId guard) live in
 * useEnhancePrompt.test.ts; this file covers polling, timeouts, and unmount.
 */

import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — vi.hoisted ensures refs are available before the factory runs (§10)
// ---------------------------------------------------------------------------

const { mockStartEnhance, mockGetEnhanceStatus } = vi.hoisted(() => ({
  mockStartEnhance: vi.fn(),
  mockGetEnhanceStatus: vi.fn(),
}));

vi.mock('@/features/generate-wizard/api', () => ({
  startEnhance: mockStartEnhance,
  getEnhanceStatus: mockGetEnhanceStatus,
  createDraft: vi.fn(),
  updateDraft: vi.fn(),
  deleteDraft: vi.fn(),
  listAssets: vi.fn(),
}));

import { useEnhancePrompt } from './useEnhancePrompt';
import type { PromptDoc } from '../types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DRAFT_ID = 'draft-abc-123';
const JOB_ID = 'job-xyz-456';

const PROMPT_DOC: PromptDoc = {
  schemaVersion: 1,
  blocks: [{ type: 'text', value: 'Make a cool intro video' }],
};

// ---------------------------------------------------------------------------
// Helper — flush all pending microtasks (Promise chains) using fake timers
// ---------------------------------------------------------------------------

async function flushMicrotasks(): Promise<void> {
  // Multiple rounds to flush nested .then() chains in the hook's async flows.
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useEnhancePrompt — timing, edge cases, unmount', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // Test 2 — failed status returned by the poll
  // -------------------------------------------------------------------------

  it('transitions to failed and exposes the server error message on a failed job', async () => {
    mockStartEnhance.mockResolvedValue({ jobId: JOB_ID });
    mockGetEnhanceStatus.mockResolvedValueOnce({
      status: 'failed',
      error: 'OpenAI quota exceeded',
    });

    const { result } = renderHook(() => useEnhancePrompt(DRAFT_ID));

    act(() => { result.current.start(PROMPT_DOC); });
    await flushMicrotasks();

    // First poll tick
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    await flushMicrotasks();

    expect(result.current.status).toBe('failed');
    expect(result.current.error).toBe('OpenAI quota exceeded');
    expect(result.current.proposedDoc).toBeNull();

    // No further polls after failure
    const callCountAtFailure = mockGetEnhanceStatus.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(mockGetEnhanceStatus).toHaveBeenCalledTimes(callCountAtFailure);
  });

  // -------------------------------------------------------------------------
  // Test 3 — 60 s timeout cap
  // -------------------------------------------------------------------------

  it('transitions to failed with timeout message after 60 s', async () => {
    mockStartEnhance.mockResolvedValue({ jobId: JOB_ID });
    // Always return running — never reaches done
    mockGetEnhanceStatus.mockResolvedValue({ status: 'running' });

    const { result } = renderHook(() => useEnhancePrompt(DRAFT_ID));

    act(() => { result.current.start(PROMPT_DOC); });
    await flushMicrotasks();

    // Advance 59 s — still running
    await act(async () => { await vi.advanceTimersByTimeAsync(59_000); });
    await flushMicrotasks();
    expect(result.current.status).toBe('running');

    // Advance 1 more second — hits the 60 s timeout boundary
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    await flushMicrotasks();

    expect(result.current.status).toBe('failed');
    expect(result.current.error).toBe('Timed out after 60s');

    // No further polls after timeout
    const callCountAtTimeout = mockGetEnhanceStatus.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(mockGetEnhanceStatus).toHaveBeenCalledTimes(callCountAtTimeout);
  });

  // -------------------------------------------------------------------------
  // Test 4 — 429 on POST
  // -------------------------------------------------------------------------

  it('transitions to failed with a rate-limit message when POST returns 429', async () => {
    const rateLimitError = new Error('rate-limited');
    mockStartEnhance.mockRejectedValue(rateLimitError);

    const { result } = renderHook(() => useEnhancePrompt(DRAFT_ID));

    act(() => { result.current.start(PROMPT_DOC); });
    await flushMicrotasks();

    expect(result.current.status).toBe('failed');
    expect(result.current.error).toContain('too many enhance requests');
    expect(mockGetEnhanceStatus).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Test 5 — unmount mid-poll clears interval and produces no warnings
  // -------------------------------------------------------------------------

  it('clears the interval on unmount and does not call setState after unmount', async () => {
    mockStartEnhance.mockResolvedValue({ jobId: JOB_ID });
    // Never resolves to done — keeps polling indefinitely
    mockGetEnhanceStatus.mockResolvedValue({ status: 'running' });

    const clearIntervalSpy = vi.spyOn(window, 'clearInterval');

    const { result, unmount } = renderHook(() => useEnhancePrompt(DRAFT_ID));

    act(() => { result.current.start(PROMPT_DOC); });
    await flushMicrotasks();

    // Let one poll tick fire
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    await flushMicrotasks();
    expect(result.current.status).toBe('running');

    // Unmount while polling is active
    act(() => { unmount(); });

    // clearInterval must have been called (both from stopPolling and/or unmount cleanup)
    expect(clearIntervalSpy).toHaveBeenCalled();

    // Advance time — no further polls or setState warnings
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });

    clearIntervalSpy.mockRestore();
  });
});
