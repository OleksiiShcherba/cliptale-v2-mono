/**
 * React Query hook that fetches the calling user's ready assets for the
 * generate-wizard. Single-page fetch (limit=100) — no infinite scroll in v1.
 *
 * When `draftId` is provided the hook fetches from
 * `GET /generation-drafts/:id/assets?scope=draft|all` — this is the scoped
 * endpoint added in E1. When `draftId` is omitted it falls back to the
 * legacy `GET /assets` (general library, no scope filtering).
 */

import { useQuery } from '@tanstack/react-query';

import { listAssets, listDraftAssets } from '@/features/generate-wizard/api';

import type { AssetListResponse } from '../types';

type UseAssetsOptions = {
  /** Pass 'all' for every kind, or a specific kind to filter. */
  type: 'all' | 'video' | 'image' | 'audio';
  /**
   * When provided, fetches assets scoped to this draft via
   * `GET /generation-drafts/:id/assets?scope=<scope>`.
   */
  draftId?: string;
  /**
   * Asset scope — only meaningful when `draftId` is provided.
   * `'draft'` returns files linked to this draft only;
   * `'all'` returns the user's entire library.
   * Defaults to `'draft'`.
   */
  scope?: 'draft' | 'all';
};

type UseAssetsResult = {
  data: AssetListResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
};

/**
 * Fetches up to 100 assets for the wizard gallery.
 *
 * Query key:
 * - With draftId: `['generate-wizard', 'assets', draftId, scope]`
 * - Without draftId: `['generate-wizard', 'assets', type]`
 */
export function useAssets({ type, draftId, scope = 'draft' }: UseAssetsOptions): UseAssetsResult {
  const { data, isLoading, isError, refetch } = useQuery<AssetListResponse>({
    queryKey: draftId
      ? ['generate-wizard', 'assets', draftId, scope]
      : ['generate-wizard', 'assets', type],
    queryFn: draftId
      ? () => listDraftAssets({ draftId, scope })
      : () => listAssets({ type, limit: 100 }),
  });

  return { data, isLoading, isError, refetch };
}
