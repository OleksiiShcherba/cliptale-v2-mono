import { useQuery } from '@tanstack/react-query';

import { getAssets } from '@/features/asset-manager/api';
import type { Asset } from '@/features/asset-manager/types';

/**
 * Shared hook that resolves the project-scoped asset list from the React Query
 * cache key `['assets', projectId, 'project']`.
 *
 * This key is the same one populated by `AssetBrowserPanel`, so when the panel
 * has already mounted the hook is zero-cost (cache hit). Components such as
 * `useRemotionPlayer` use this hook to look up `fileId → status/url` without
 * issuing per-asset requests.
 */
export function useProjectAssets(projectId: string): {
  assets: Asset[];
  isLoading: boolean;
  isError: boolean;
} {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['assets', projectId, 'project'],
    queryFn: () => getAssets(projectId, 'project'),
    // staleTime is intentionally omitted here — inherited from QueryClient defaults
    // set in main.tsx (60_000 ms). This prevents a redundant fetch when the
    // panel has already populated the cache within the last minute.
  });

  return {
    assets: data?.items ?? [],
    isLoading,
    isError,
  };
}
