/**
 * useAssets — envelope shape unit tests (subtask 6 fix).
 *
 * Verifies that when `draftId` is provided:
 *   - `listDraftAssets` is called with the correct draftId + scope
 *   - The hook exposes `data.items` (envelope shape), not a bare array
 *   - When `listDraftAssets` resolves to `{ items: [], nextCursor: null, totals: ... }`,
 *     `data.items` is an empty array (not `undefined`)
 *   - When `listDraftAssets` resolves with items, `data.items` contains them
 *
 * When `draftId` is omitted the hook falls back to `listAssets` — that path
 * is tested implicitly by the existing gallery component tests.
 */

import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Mocks — vi.hoisted ensures refs are available when the factory runs (§10)
// ---------------------------------------------------------------------------

const { mockListDraftAssets, mockListAssets } = vi.hoisted(() => ({
  mockListDraftAssets: vi.fn(),
  mockListAssets: vi.fn(),
}));

vi.mock('@/features/generate-wizard/api', () => ({
  listDraftAssets: mockListDraftAssets,
  listAssets: mockListAssets,
  createDraft: vi.fn(),
  updateDraft: vi.fn(),
  deleteDraft: vi.fn(),
  fetchDraft: vi.fn(),
  startEnhance: vi.fn(),
  getEnhanceStatus: vi.fn(),
  linkFileToDraft: vi.fn(),
}));

import { useAssets } from './useAssets';
import type { AssetListResponse } from '@/features/generate-wizard/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DRAFT_ID = 'draft-test-001';

const EMPTY_ENVELOPE: AssetListResponse = {
  items: [],
  nextCursor: null,
  totals: { count: 0, bytesUsed: 0 },
};

const FILLED_ENVELOPE: AssetListResponse = {
  items: [
    {
      id: 'file-aaa',
      type: 'video',
      label: 'clip.mp4',
      durationSeconds: 30,
      thumbnailUrl: null,
      createdAt: '2026-04-21T00:00:00.000Z',
    },
    {
      id: 'file-bbb',
      type: 'image',
      label: 'photo.png',
      durationSeconds: null,
      thumbnailUrl: null,
      createdAt: '2026-04-21T00:00:01.000Z',
    },
  ],
  nextCursor: null,
  totals: { count: 2, bytesUsed: 2048 },
};

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

describe('useAssets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('when draftId is provided', () => {
    it('calls listDraftAssets with the correct draftId and scope=draft', async () => {
      mockListDraftAssets.mockResolvedValue(EMPTY_ENVELOPE);

      const { result } = renderHook(
        () => useAssets({ type: 'all', draftId: DRAFT_ID, scope: 'draft' }),
        { wrapper: makeWrapper() },
      );

      await waitFor(() => !result.current.isLoading);

      expect(mockListDraftAssets).toHaveBeenCalledWith({ draftId: DRAFT_ID, scope: 'draft' });
      expect(mockListAssets).not.toHaveBeenCalled();
    });

    it('exposes data.items as an empty array (not undefined) for an empty draft', async () => {
      mockListDraftAssets.mockResolvedValue(EMPTY_ENVELOPE);

      const { result } = renderHook(
        () => useAssets({ type: 'all', draftId: DRAFT_ID }),
        { wrapper: makeWrapper() },
      );

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.isError).toBe(false);
      // Envelope must be an object with an items array, not a bare array
      expect(result.current.data).toBeDefined();
      expect(Array.isArray(result.current.data?.items)).toBe(true);
      expect(result.current.data?.items).toHaveLength(0);
    });

    it('exposes data.items with the correct items when draft has linked files', async () => {
      mockListDraftAssets.mockResolvedValue(FILLED_ENVELOPE);

      const { result } = renderHook(
        () => useAssets({ type: 'all', draftId: DRAFT_ID }),
        { wrapper: makeWrapper() },
      );

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.isError).toBe(false);
      expect(result.current.data?.items).toHaveLength(2);
      expect(result.current.data?.items[0]?.id).toBe('file-aaa');
      expect(result.current.data?.items[0]?.type).toBe('video');
      expect(result.current.data?.items[1]?.id).toBe('file-bbb');
      expect(result.current.data?.items[1]?.type).toBe('image');
    });

    it('calls listDraftAssets with scope=all when scope prop is all', async () => {
      mockListDraftAssets.mockResolvedValue(EMPTY_ENVELOPE);

      renderHook(
        () => useAssets({ type: 'all', draftId: DRAFT_ID, scope: 'all' }),
        { wrapper: makeWrapper() },
      );

      await waitFor(() => expect(mockListDraftAssets).toHaveBeenCalled());

      expect(mockListDraftAssets).toHaveBeenCalledWith({ draftId: DRAFT_ID, scope: 'all' });
    });

    it('sets isError to true when listDraftAssets rejects', async () => {
      mockListDraftAssets.mockRejectedValue(new Error('Network failure'));

      const { result } = renderHook(
        () => useAssets({ type: 'all', draftId: DRAFT_ID }),
        { wrapper: makeWrapper() },
      );

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.isError).toBe(true);
      expect(result.current.data).toBeUndefined();
    });
  });

  describe('when draftId is omitted', () => {
    it('calls listAssets (not listDraftAssets)', async () => {
      mockListAssets.mockResolvedValue(EMPTY_ENVELOPE);

      const { result } = renderHook(
        () => useAssets({ type: 'all' }),
        { wrapper: makeWrapper() },
      );

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(mockListDraftAssets).not.toHaveBeenCalled();
      expect(mockListAssets).toHaveBeenCalled();
    });
  });
});
