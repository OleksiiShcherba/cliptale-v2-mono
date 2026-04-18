/**
 * useGenerationDraft — primary tests.
 *
 * Covers: initial state, first-setDoc create, status transitions, and no-op guard.
 * Timing / coalesce / flush / error-retry / unmount tests live in
 * useGenerationDraft.timing.test.ts.
 */

import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// vi.hoisted ensures mock refs are available when the factory runs (§10 rule).
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
import { EMPTY_DOC, DOC_A, DRAFT_RESPONSE } from './useGenerationDraft.fixtures';

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

describe('useGenerationDraft', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // Test 1 — no request when setDoc is never called
  // -------------------------------------------------------------------------

  it('makes no API request when setDoc is never called', async () => {
    const { result } = renderHook(() => useGenerationDraft({ initial: EMPTY_DOC }), {
      wrapper: makeWrapper(),
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(mockCreateDraft).not.toHaveBeenCalled();
    expect(mockUpdateDraft).not.toHaveBeenCalled();
    expect(result.current.draftId).toBeNull();
    expect(result.current.status).toBe('idle');
  });

  // -------------------------------------------------------------------------
  // Test 2 — first setDoc triggers POST after 800ms; draftId set from response
  // -------------------------------------------------------------------------

  it('calls createDraft after 800ms debounce on first setDoc and stores the returned id', async () => {
    mockCreateDraft.mockResolvedValue(DRAFT_RESPONSE);

    const { result } = renderHook(() => useGenerationDraft({ initial: EMPTY_DOC }), {
      wrapper: makeWrapper(),
    });

    act(() => { result.current.setDoc(DOC_A); });

    // Before 800ms: no request yet.
    await act(async () => { await vi.advanceTimersByTimeAsync(799); });
    expect(mockCreateDraft).not.toHaveBeenCalled();

    // After 800ms: POST is fired.
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });

    expect(mockCreateDraft).toHaveBeenCalledOnce();
    expect(mockCreateDraft).toHaveBeenCalledWith(DOC_A);
    expect(result.current.draftId).toBe('draft-abc-123');
  });

  // -------------------------------------------------------------------------
  // Test 5 — status transitions idle → saving → saved
  // -------------------------------------------------------------------------

  it('transitions status idle → saving → saved on a successful create', async () => {
    let resolveCreate!: (v: typeof DRAFT_RESPONSE) => void;
    mockCreateDraft.mockReturnValue(
      new Promise<typeof DRAFT_RESPONSE>((res) => { resolveCreate = res; }),
    );

    const { result } = renderHook(() => useGenerationDraft({ initial: EMPTY_DOC }), {
      wrapper: makeWrapper(),
    });

    expect(result.current.status).toBe('idle');

    act(() => { result.current.setDoc(DOC_A); });

    await act(async () => { await vi.advanceTimersByTimeAsync(800); });
    expect(result.current.status).toBe('saving');

    await act(async () => { resolveCreate(DRAFT_RESPONSE); });

    expect(result.current.status).toBe('saved');
    expect(result.current.lastSavedAt).toBeInstanceOf(Date);
  });

  // -------------------------------------------------------------------------
  // Test 9 — setDoc with the same doc content is a no-op
  // -------------------------------------------------------------------------

  it('treats setDoc with the same doc content as a no-op — no request is made', async () => {
    const { result } = renderHook(() => useGenerationDraft({ initial: DOC_A }), {
      wrapper: makeWrapper(),
    });

    // Call setDoc with a structurally identical but different object reference.
    act(() => {
      result.current.setDoc({ schemaVersion: 1, blocks: [{ type: 'text', value: 'hello' }] });
    });

    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });

    expect(mockCreateDraft).not.toHaveBeenCalled();
    expect(mockUpdateDraft).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
  });
});
