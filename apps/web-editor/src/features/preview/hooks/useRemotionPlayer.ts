import { useRef, useSyncExternalStore } from 'react';
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

  // Collect unique assetIds from video and audio clips — text-overlay clips have none.
  const assetIds = Array.from(
    new Set(
      projectDoc.clips
        .filter((clip) => clip.type === 'video' || clip.type === 'audio')
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

  // Build the assetId → URL map from successfully-loaded assets.
  // Assets still loading are omitted — the layer will receive an empty src.
  // The API stream endpoint is used so the browser never receives a raw s3:// URI.
  const assetUrls: AssetUrls = {};
  assetResults.forEach((result, index) => {
    const assetId = assetIds[index];
    if (result.data && assetId) {
      assetUrls[assetId] = `${config.apiBaseUrl}/assets/${assetId}/stream`;
    }
  });

  return {
    projectDoc,
    assetUrls,
    currentFrame: ephemeral.playheadFrame,
    playerRef,
  };
}
