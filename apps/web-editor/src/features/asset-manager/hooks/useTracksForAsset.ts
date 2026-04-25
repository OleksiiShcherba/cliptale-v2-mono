import { useMemo, useSyncExternalStore } from 'react';

import type { Track } from '@ai-video-editor/project-schema';

import type { Asset } from '@/features/asset-manager/types';
import { getSnapshot, subscribe } from '@/store/project-store';

/** Returns the track type that accepts clips for the given asset content type. */
function trackTypeForAsset(contentType: string): Track['type'] | null {
  if (contentType.startsWith('video/') || contentType.startsWith('image/')) return 'video';
  if (contentType.startsWith('audio/')) return 'audio';
  return null;
}

/**
 * Subscribes to the project store and returns all tracks whose type matches
 * the given asset's content type.
 *
 * - `video/*` and `image/*` assets → returns all `type === 'video'` tracks
 * - `audio/*` assets → returns all `type === 'audio'` tracks
 * - Unsupported content types → returns `[]`
 *
 * Re-renders the consumer whenever the project's track list changes.
 */
export function useTracksForAsset(asset: Asset): Track[] {
  const doc = useSyncExternalStore(subscribe, getSnapshot);
  return useMemo(() => {
    const targetType = trackTypeForAsset(asset.contentType);
    if (!targetType) return [];
    return doc.tracks.filter(t => t.type === targetType);
  }, [doc.tracks, asset.contentType]);
}
