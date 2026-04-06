import { useMemo, useRef, useSyncExternalStore } from 'react';
import { useQueries } from '@tanstack/react-query';
import type { PlayerRef } from '@remotion/player';

import type { ProjectDoc } from '@ai-video-editor/project-schema';

import { getSnapshot as getProjectSnapshot, subscribe as subscribeProject } from '@/store/project-store.js';
import { getSnapshot as getEphemeralSnapshot, subscribe as subscribeEphemeral } from '@/store/ephemeral-store.js';
import { getAsset } from '@/features/asset-manager/api.js';
import { config } from '@/lib/config.js';

type AssetUrls = Record<string, string>;

type UseRemotionPlayerResult = {
  projectDoc: ProjectDoc;
  assetUrls: AssetUrls;
  currentFrame: number;
  playerRef: React.RefObject<PlayerRef | null>;
};

/**
 * Subscribes to the project and ephemeral stores and resolves presigned asset
 * URLs via React Query. Returns everything the PreviewPanel needs to mount the
 * Remotion <Player>.
 *
 * Asset URL fetching is batched using `useQueries` — one query per unique
 * assetId found across all clips. The resulting map is keyed by assetId.
 */
export function useRemotionPlayer(): UseRemotionPlayerResult {
  const playerRef = useRef<PlayerRef | null>(null);

  const projectDoc = useSyncExternalStore(subscribeProject, getProjectSnapshot);
  const ephemeral = useSyncExternalStore(subscribeEphemeral, getEphemeralSnapshot);

  // Collect unique assetIds from media clips — text-overlay clips have no asset.
  const assetIds = Array.from(
    new Set(
      projectDoc.clips
        .filter((clip) => clip.type === 'video' || clip.type === 'audio' || clip.type === 'image')
        .map((clip) => (clip as { assetId: string }).assetId),
    ),
  );

  const assetResults = useQueries({
    queries: assetIds.map((assetId) => ({
      queryKey: ['asset', assetId] as const,
      queryFn: () => getAsset(assetId),
      // Assets that have been fetched once are stable — stale for 5 min.
      staleTime: 5 * 60 * 1000,
    })),
  });

  // Stable key: changes only when the set of ready asset IDs changes.
  // Prevents assetUrls from getting a new reference on every render,
  // which would otherwise cause unnecessary prefetch re-runs downstream.
  const readyAssetIds = assetResults
    .map((r, i) => (r.data?.status === 'ready' ? assetIds[i] : null))
    .filter((id): id is string => id !== null)
    .join(',');

  // Build the assetId → URL map from successfully-loaded assets.
  // Assets still loading are omitted — the layer will receive an empty src.
  // The API stream endpoint is used so the browser never receives a raw s3:// URI.
  const assetUrls = useMemo(() => {
    const urls: AssetUrls = {};
    readyAssetIds.split(',').filter(Boolean).forEach((assetId) => {
      urls[assetId] = `${config.apiBaseUrl}/assets/${assetId}/stream`;
    });
    return urls;
  }, [readyAssetIds]);

  return {
    projectDoc,
    assetUrls,
    currentFrame: ephemeral.playheadFrame,
    playerRef,
  };
}
