import { useMemo, useRef, useSyncExternalStore } from 'react';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import type { PlayerRef } from '@remotion/player';

import type { ProjectDoc } from '@ai-video-editor/project-schema';

import { getSnapshot as getProjectSnapshot, subscribe as subscribeProject } from '@/store/project-store.js';
import { getSnapshot as getEphemeralSnapshot, subscribe as subscribeEphemeral } from '@/store/ephemeral-store.js';
import { getAsset, getAssets } from '@/features/asset-manager/api.js';
import type { Asset } from '@/features/asset-manager/types.js';
import { config } from '@/lib/config.js';
import { buildAuthenticatedUrl } from '@/lib/api-client.js';

type AssetUrls = Record<string, string>;

type UseRemotionPlayerResult = {
  projectDoc: ProjectDoc;
  assetUrls: AssetUrls;
  currentFrame: number;
  playerRef: React.RefObject<PlayerRef | null>;
};

/**
 * Subscribes to the project and ephemeral stores and resolves presigned asset
 * URLs. Returns everything the PreviewPanel needs to mount the Remotion <Player>.
 *
 * Asset resolution strategy (issue 1.1 fix):
 * 1. Read the project-assets list from the React Query cache key
 *    `['assets', projectId, 'project']` — this cache is populated by
 *    `AssetBrowserPanel` / `useProjectAssets` via a single list fetch.
 * 2. For each clip fileId found in the cached list, build the stream URL
 *    directly from in-cache data — zero extra HTTP requests.
 * 3. For any fileId NOT in the list (orphan clip), fall back to a targeted
 *    `getAsset(fileId)` query via `useQueries`. When all fileIds are in cache
 *    the `useQueries` array is empty and no requests are made.
 */
export function useRemotionPlayer(): UseRemotionPlayerResult {
  const playerRef = useRef<PlayerRef | null>(null);

  const projectDoc = useSyncExternalStore(subscribeProject, getProjectSnapshot);
  const ephemeral = useSyncExternalStore(subscribeEphemeral, getEphemeralSnapshot);

  const projectId = projectDoc.id;

  // Collect unique fileIds from media clips — text-overlay clips have no asset.
  const fileIds = Array.from(
    new Set(
      projectDoc.clips
        .filter((clip) => clip.type === 'video' || clip.type === 'audio' || clip.type === 'image')
        .map((clip) => (clip as { fileId: string }).fileId),
    ),
  );

  // ── Step 1: Read the project-assets cache (populated by AssetBrowserPanel). ──
  // Synchronous read — no subscription, no re-render on cache changes.
  // When AssetBrowserPanel is mounted and has fetched its list, this returns
  // a non-null value and we skip per-asset fetches entirely.
  const queryClient = useQueryClient();
  const cachedListData = queryClient.getQueryData<Awaited<ReturnType<typeof getAssets>>>([
    'assets',
    projectId,
    'project',
  ]);
  const cachedItems: Asset[] = cachedListData?.items ?? [];

  // Build a lookup map from the cached list for O(1) access.
  const cachedByFileId = useMemo(() => {
    const map = new Map<string, Asset>();
    cachedItems.forEach((a) => map.set(a.id, a));
    return map;
    // cachedItems reference is stable when the cache entry has not changed
  }, [cachedItems]);

  // ── Step 2: Identify fileIds NOT yet in the project-list cache. ──
  const missingFileIds = fileIds.filter((id) => !cachedByFileId.has(id));

  // ── Step 3: Fire fallback queries only for missing fileIds via useQueries. ──
  // When all fileIds are in cache, `queries` array is empty → zero HTTP requests.
  // `useQueries` safely supports a dynamic-length array of query definitions.
  const fallbackResults = useQueries({
    queries: missingFileIds.map((fileId) => ({
      queryKey: ['asset', fileId] as const,
      queryFn: () => getAsset(fileId),
      // 5-minute stale time keeps orphan-asset queries stable between re-renders
      staleTime: 5 * 60 * 1000,
    })),
  });

  // Build a merged map: cached list data + any resolved fallback data.
  const resolvedByFileId = useMemo(() => {
    const map = new Map<string, Asset>(cachedByFileId);
    fallbackResults.forEach((r, i) => {
      const asset = r.data;
      if (asset) map.set(missingFileIds[i], asset);
    });
    return map;
  // fallbackResults is a stable array reference when no query states have changed
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cachedByFileId, ...fallbackResults.map((r) => r.data)]);

  // Stable key: changes only when the set of ready file IDs changes.
  // Prevents assetUrls from getting a new reference on every unrelated render.
  const readyFileIds = fileIds
    .filter((id) => resolvedByFileId.get(id)?.status === 'ready')
    .join(',');

  // Build the fileId → stream URL map from successfully-loaded, ready assets.
  // Assets still loading or not-ready are omitted — the layer gets an empty src.
  const assetUrls = useMemo(() => {
    const urls: AssetUrls = {};
    readyFileIds.split(',').filter(Boolean).forEach((fileId) => {
      urls[fileId] = buildAuthenticatedUrl(`${config.apiBaseUrl}/assets/${fileId}/stream`);
    });
    return urls;
  }, [readyFileIds]);

  return {
    projectDoc,
    assetUrls,
    currentFrame: ephemeral.playheadFrame,
    playerRef,
  };
}
