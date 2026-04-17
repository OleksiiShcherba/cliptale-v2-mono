/**
 * useGenerationDraft — timing, coalesce, flush, error-retry, and unmount tests.
 *
 * Primary state / initial-state tests live in useGenerationDraft.test.ts.
 */

import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockCreateDraft, mockUpdateDraft } = vi.hoisted(() => ({
  mockCreateDraft: vi.fn(),
  mockUpdateDraft: vi.fn(),
}));

vi.mock('@/features/generate-wizard/api', () => ({
  createDraft: mockCreateDraft,
  updateDraft: mockUpdateDraft,
  listAssets: vi.fn(),
}));

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useGenerationDraft } from './useGenerationDraft';
import { EMPTY_DOC, DOC_A, DOC_B, DRAFT_RESPONSE } from './useGenerationDraft.fixtures';

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useGenerationDraft — timing / coalesce / flush / error / unmount', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // Test 3 — second setDoc within 800ms coalesces into one save, not a second POST
  // -------------------------------------------------------------------------

  it('coalesces rapid setDoc calls — one createDraft fires with the latest doc', async () => {
    mockCreateDraft.mockResolvedValue(DRAFT_RESPONSE);

    const { result } = renderHook(() => useGenerationDraft(EMPTY_DOC), {
      wrapper: makeWrapper(),
    });

    act(() => { result.current.setDoc(DOC_A); });

    await act(async () => { await vi.advanceTimersByTimeAsync(400); });

    act(() => { result.current.setDoc(DOC_B); });

    // Let the timer for DOC_B fire (800ms after DOC_B).
    await act(async () => { await vi.advanceTimersByTimeAsync(800); });

    // Only ONE create call with the latest doc.
    expect(mockCreateDraft).toHaveBeenCalledOnce();
    expect(mockCreateDraft).toHaveBeenCalledWith(DOC_B);
    expect(mockUpdateDraft).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Test 4 — setDoc after first save triggers PUT to /generation-drafts/:draftId
  // -------------------------------------------------------------------------

  it('calls updateDraft on subsequent edits after the draft has been created', async () => {
    mockCreateDraft.mockResolvedValue(DRAFT_RESPONSE);
    mockUpdateDraft.mockResolvedValue({ ...DRAFT_RESPONSE, promptDoc: DOC_B });

    const { result } = renderHook(() => useGenerationDraft(EMPTY_DOC), {
      wrapper: makeWrapper(),
    });

    // First edit — create the draft.
    act(() => { result.current.setDoc(DOC_A); });
    await act(async () => { await vi.advanceTimersByTimeAsync(800); });

    expect(mockCreateDraft).toHaveBeenCalledOnce();
    expect(result.current.draftId).toBe('draft-abc-123');

    // Second edit — update the existing draft.
    act(() => { result.current.setDoc(DOC_B); });
    await act(async () => { await vi.advanceTimersByTimeAsync(800); });

    expect(mockUpdateDraft).toHaveBeenCalledOnce();
    expect(mockUpdateDraft).toHaveBeenCalledWith('draft-abc-123', DOC_B);
    // createDraft must NOT have been called a second time.
    expect(mockCreateDraft).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------------------------
  // Test 6 — failed PUT sets status='error' after one automatic retry; no more
  // -------------------------------------------------------------------------

  it('sets status to "error" after both the initial attempt and the automatic retry fail', async () => {
    mockCreateDraft.mockResolvedValue(DRAFT_RESPONSE);
    // Both update attempts reject.
    mockUpdateDraft.mockRejectedValue(new Error('Server error'));

    const { result } = renderHook(() => useGenerationDraft(EMPTY_DOC), {
      wrapper: makeWrapper(),
    });

    // First edit — create draft successfully.
    act(() => { result.current.setDoc(DOC_A); });
    await act(async () => { await vi.advanceTimersByTimeAsync(800); });
    expect(result.current.draftId).toBe('draft-abc-123');

    // Second edit — update draft, both attempts fail.
    act(() => { result.current.setDoc(DOC_B); });
    await act(async () => { await vi.advanceTimersByTimeAsync(800); });

    expect(result.current.status).toBe('error');
    // Two calls: the initial attempt + the automatic retry.
    expect(mockUpdateDraft).toHaveBeenCalledTimes(2);
  });

  // -------------------------------------------------------------------------
  // Test 7 — flush() cancels the timer and resolves after the request completes
  // -------------------------------------------------------------------------

  it('flush() cancels the pending timer and immediately triggers the save', async () => {
    mockCreateDraft.mockResolvedValue(DRAFT_RESPONSE);

    const { result } = renderHook(() => useGenerationDraft(EMPTY_DOC), {
      wrapper: makeWrapper(),
    });

    act(() => { result.current.setDoc(DOC_A); });

    // Only 400ms elapsed — timer not yet fired.
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    expect(mockCreateDraft).not.toHaveBeenCalled();

    // flush() should fire the save immediately.
    await act(async () => { await result.current.flush(); });

    expect(mockCreateDraft).toHaveBeenCalledOnce();
    expect(result.current.status).toBe('saved');

    // Advancing past the original window should not trigger a second call.
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    expect(mockCreateDraft).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------------------------
  // Test 8 — unmounting before the timer fires cancels the save
  // -------------------------------------------------------------------------

  it('cancels the pending timer on unmount — no POST or PUT is made', async () => {
    const { result, unmount } = renderHook(() => useGenerationDraft(EMPTY_DOC), {
      wrapper: makeWrapper(),
    });

    act(() => { result.current.setDoc(DOC_A); });

    // Unmount before the 800ms window fires.
    act(() => { unmount(); });

    // Advance past the debounce window.
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });

    expect(mockCreateDraft).not.toHaveBeenCalled();
    expect(mockUpdateDraft).not.toHaveBeenCalled();
  });
});
