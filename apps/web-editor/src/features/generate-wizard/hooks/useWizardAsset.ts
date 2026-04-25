/**
 * Fetches a single full Asset record for the wizard's asset detail panel.
 *
 * The wizard gallery operates on `AssetSummary` (lightweight list items), but
 * `AssetDetailPanel` requires the complete `Asset` shape. This hook bridges
 * the gap: given an asset id it fetches the full record via the asset-manager
 * API and caches it in React Query.
 *
 * Query key: `['wizard-asset', id]`
 */

import { useQuery } from '@tanstack/react-query';

import { getAsset } from '@/features/asset-manager/api';
import type { Asset } from '@/features/asset-manager/types';

type UseWizardAssetResult = {
  asset: Asset | undefined;
  isLoading: boolean;
  isError: boolean;
};

/**
 * Fetches the full `Asset` record for the given file id.
 * Returns `{ asset: undefined }` when `fileId` is null (panel closed state).
 */
export function useWizardAsset(fileId: string | null): UseWizardAssetResult {
  const { data, isLoading, isError } = useQuery<Asset>({
    queryKey: ['wizard-asset', fileId],
    queryFn: () => getAsset(fileId!),
    enabled: fileId !== null,
  });

  return { asset: data, isLoading, isError };
}
