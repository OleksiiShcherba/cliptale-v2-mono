/**
 * useEnhancePrompt — core API tests.
 *
 * Tests the primary hook interface: start() transitions to queued,
 * reset() clears state, null-draftId guard, double-start prevention, and
 * the happy path through done. Timing and edge-case tests in
 * useEnhancePrompt.timing.test.ts.
 *
 * Uses Vitest fake timers and mocked `api.ts` following the
 * useGenerationDraft.test.ts pattern.
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

const PROPOSED_DOC: PromptDoc = {
  schemaVersion: 1,
  blocks: [{ type: 'text', value: 'Create a dynamic, eye-catching introduction video' }],
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

describe('useEnhancePrompt', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // Test 1 — happy path: POST → 2 running polls → done with proposedDoc
  // -------------------------------------------------------------------------

  it('transitions to done and exposes proposedDoc after polling resolves done', async () => {
    mockStartEnhance.mockResolvedValue({ jobId: JOB_ID });
    mockGetEnhanceStatus
      .mockResolvedValueOnce({ status: 'running' })
      .mockResolvedValueOnce({ status: 'running' })
      .mockResolvedValueOnce({ status: 'done', result: PROPOSED_DOC });

    const { result } = renderHook(() => useEnhancePrompt(DRAFT_ID));

    expect(result.current.status).toBe('idle');

    // Start the enhance flow
    act(() => { result.current.start(PROMPT_DOC); });

    // POST is async — flush so the resolved promise runs and startPolling is called
    await flushMicrotasks();

    expect(mockStartEnhance).toHaveBeenCalledOnce();
    expect(mockStartEnhance).toHaveBeenCalledWith(DRAFT_ID);

    // First poll tick — running
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    await flushMicrotasks();
    expect(result.current.status).toBe('running');

    // Second poll tick — still running
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    await flushMicrotasks();
    expect(result.current.status).toBe('running');

    // Third poll tick — done
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    await flushMicrotasks();

    expect(result.current.status).toBe('done');
    expect(result.current.proposedDoc).toEqual(PROPOSED_DOC);
    expect(result.current.error).toBeNull();

    // No further polls — interval must have been cleared
    const callCountAtDone = mockGetEnhanceStatus.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    await flushMicrotasks();
    // getEnhanceStatus called exactly 3 times: two running + one done
    expect(mockGetEnhanceStatus).toHaveBeenCalledTimes(callCountAtDone);
    expect(callCountAtDone).toBe(3);
  });

  // -------------------------------------------------------------------------
  // Test 6 — double start is a no-op (only one POST fires)
  // -------------------------------------------------------------------------

  it('ignores a second start() call while the first is in progress', async () => {
    mockStartEnhance.mockResolvedValue({ jobId: JOB_ID });
    mockGetEnhanceStatus.mockResolvedValue({ status: 'running' });

    const { result } = renderHook(() => useEnhancePrompt(DRAFT_ID));

    act(() => { result.current.start(PROMPT_DOC); });
    // Status is now queued — call start again before the POST resolves
    act(() => { result.current.start(PROMPT_DOC); });

    await flushMicrotasks();

    // Only one POST must have fired
    expect(mockStartEnhance).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------------------------
  // Test 7 — reset() clears state and re-enables the button
  // -------------------------------------------------------------------------

  it('reset() returns status to idle and clears proposedDoc/error', async () => {
    mockStartEnhance.mockResolvedValue({ jobId: JOB_ID });
    mockGetEnhanceStatus.mockResolvedValueOnce({ status: 'done', result: PROPOSED_DOC });

    const { result } = renderHook(() => useEnhancePrompt(DRAFT_ID));

    act(() => { result.current.start(PROMPT_DOC); });
    await flushMicrotasks();

    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    await flushMicrotasks();

    expect(result.current.status).toBe('done');
    expect(result.current.proposedDoc).toEqual(PROPOSED_DOC);

    act(() => { result.current.reset(); });

    expect(result.current.status).toBe('idle');
    expect(result.current.proposedDoc).toBeNull();
    expect(result.current.error).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Test 8 — draftId null prevents start
  // -------------------------------------------------------------------------

  it('start() is a no-op when draftId is null', async () => {
    const { result } = renderHook(() => useEnhancePrompt(null));

    act(() => { result.current.start(PROMPT_DOC); });
    await flushMicrotasks();

    expect(mockStartEnhance).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
  });
});
