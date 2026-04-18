/**
 * useGenerationDraft — hydrate branch tests.
 *
 * Covers: (1) hydrate from existing draftId, (2) PUT-not-POST on first
 * autosave after hydrate, (3) fall-through on 404, (4) fresh-start when no
 * draftId param.
 *
 * Timing / coalesce / flush / error-retry / unmount tests live in
 * useGenerationDraft.timing.test.ts.
 * Primary state / initial-state tests live in useGenerationDraft.test.ts.
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// vi.hoisted ensures mock refs are available when the factory runs (§10 rule).
// ---------------------------------------------------------------------------

const { mockCreateDraft, mockUpdateDraft, mockFetchDraft } = vi.hoisted(() => ({
  mockCreateDraft: vi.fn(),
  mockUpdateDraft: vi.fn(),
  mockFetchDraft: vi.fn(),
}));

vi.mock('@/features/generate-wizard/api', () => ({
  createDraft: mockCreateDraft,
  updateDraft: mockUpdateDraft,
  fetchDraft: mockFetchDraft,
  listAssets: vi.fn(),
}));

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useGenerationDraft } from './useGenerationDraft';
import { DOC_A, DOC_B, DRAFT_RESPONSE, EMPTY_DOC } from './useGenerationDraft.fixtures';

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

describe('useGenerationDraft — hydrate branch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // Test 1 — hydrate from existing draftId populates doc and draftId
  // -------------------------------------------------------------------------

  it('hydrates doc and draftId from the fetched draft when initialDraftId is provided', async () => {
    let resolveFetch!: (v: typeof DRAFT_RESPONSE) => void;
    const fetchPromise = new Promise<typeof DRAFT_RESPONSE>((res) => {
      resolveFetch = res;
    });
    mockFetchDraft.mockReturnValue(fetchPromise);

    const { result } = renderHook(
      () => useGenerationDraft({ initialDraftId: 'draft-abc-123' }),
      { wrapper: makeWrapper() },
    );

    // Initially default doc is shown.
    expect(result.current.draftId).toBeNull();

    // Resolve the fetch promise and wait for state update.
    await act(async () => {
      resolveFetch(DRAFT_RESPONSE);
      await fetchPromise;
    });

    expect(mockFetchDraft).toHaveBeenCalledOnce();
    expect(mockFetchDraft).toHaveBeenCalledWith('draft-abc-123');
    // doc should be hydrated from the fetched draft.
    expect(result.current.draftId).toBe('draft-abc-123');
    expect(result.current.doc).toEqual(DRAFT_RESPONSE.promptDoc);
  });

  // -------------------------------------------------------------------------
  // Test 2 — first autosave after hydrate PUTs, never POSTs
  // -------------------------------------------------------------------------

  it('PUTs (not POSTs) on the first autosave after a successful hydrate', async () => {
    let resolveFetch!: (v: typeof DRAFT_RESPONSE) => void;
    const fetchPromise = new Promise<typeof DRAFT_RESPONSE>((res) => {
      resolveFetch = res;
    });
    mockFetchDraft.mockReturnValue(fetchPromise);
    mockUpdateDraft.mockResolvedValue({ ...DRAFT_RESPONSE, promptDoc: DOC_B });

    const { result } = renderHook(
      () => useGenerationDraft({ initialDraftId: 'draft-abc-123' }),
      { wrapper: makeWrapper() },
    );

    // Resolve the fetch and wait for hydration.
    await act(async () => {
      resolveFetch(DRAFT_RESPONSE);
      await fetchPromise;
    });

    expect(result.current.draftId).toBe('draft-abc-123');

    // Now the user edits.
    act(() => { result.current.setDoc(DOC_B); });

    // Advance past debounce window.
    await act(async () => { await vi.advanceTimersByTimeAsync(800); });

    // Should PUT to the existing draft id, not POST a new draft.
    expect(mockUpdateDraft).toHaveBeenCalledOnce();
    expect(mockUpdateDraft).toHaveBeenCalledWith('draft-abc-123', DOC_B);
    expect(mockCreateDraft).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Test 3 — fall-through on 404: no crash, fresh-start flow engaged
  // -------------------------------------------------------------------------

  it('falls through to fresh-start when fetchDraft rejects (e.g. 404)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    let rejectFetch!: (err: Error) => void;
    const fetchPromise = new Promise<typeof DRAFT_RESPONSE>((_, rej) => {
      rejectFetch = rej;
    });
    mockFetchDraft.mockReturnValue(fetchPromise);
    mockCreateDraft.mockResolvedValue(DRAFT_RESPONSE);

    const { result } = renderHook(
      () => useGenerationDraft({ initialDraftId: 'bad-id' }),
      { wrapper: makeWrapper() },
    );

    // Reject the fetch promise and wait for the error handler.
    await act(async () => {
      rejectFetch(new Error('GET /generation-drafts/bad-id failed: 404'));
      // The catch in the effect logs a warn, but the promise rejection itself is swallowed.
      // We need to catch it here too to prevent unhandled rejection.
      try {
        await fetchPromise;
      } catch {
        // Expected — the promise rejects.
      }
    });

    // draftId remains null — fresh-start state.
    expect(result.current.draftId).toBeNull();
    expect(result.current.status).toBe('idle');
    expect(warnSpy).toHaveBeenCalledOnce();

    // User edits — should fall through to POST (create), not PUT.
    act(() => { result.current.setDoc(DOC_A); });
    await act(async () => { await vi.advanceTimersByTimeAsync(800); });

    expect(mockCreateDraft).toHaveBeenCalledOnce();
    expect(mockUpdateDraft).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  // -------------------------------------------------------------------------
  // Test 4 — fresh-start when no draftId param
  // -------------------------------------------------------------------------

  it('behaves as fresh-start when initialDraftId is not provided', async () => {
    mockCreateDraft.mockResolvedValue(DRAFT_RESPONSE);

    const { result } = renderHook(
      () => useGenerationDraft({ initial: EMPTY_DOC }),
      { wrapper: makeWrapper() },
    );

    expect(result.current.draftId).toBeNull();
    expect(result.current.doc).toEqual(EMPTY_DOC);

    act(() => { result.current.setDoc(DOC_A); });
    await act(async () => { await vi.advanceTimersByTimeAsync(800); });

    // fetchDraft must NOT have been called.
    expect(mockFetchDraft).not.toHaveBeenCalled();
    // createDraft is called — fresh-start POST flow.
    expect(mockCreateDraft).toHaveBeenCalledOnce();
    expect(mockCreateDraft).toHaveBeenCalledWith(DOC_A);
    expect(result.current.draftId).toBe('draft-abc-123');
  });
});
