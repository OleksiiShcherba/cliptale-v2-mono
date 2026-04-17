/**
 * React Query hook that fetches the calling user's ready assets for the
 * generate-wizard. Single-page fetch (limit=100) — no infinite scroll in v1.
 */

import { useQuery } from '@tanstack/react-query';

import { listAssets } from '@/features/generate-wizard/api';

import type { AssetListResponse } from '../types';

type UseAssetsOptions = {
  /** Pass 'all' for every kind, or a specific kind to filter. */
  type: 'all' | 'video' | 'image' | 'audio';
};

type UseAssetsResult = {
  data: AssetListResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
};

/**
 * Fetches up to 100 assets of the requested type.
 * Query key: `['generate-wizard', 'assets', type]`
 */
export function useAssets({ type }: UseAssetsOptions): UseAssetsResult {
  const { data, isLoading, isError, refetch } = useQuery<AssetListResponse>({
    queryKey: ['generate-wizard', 'assets', type],
    queryFn: () => listAssets({ type, limit: 100 }),
  });

  return { data, isLoading, isError, refetch };
}
