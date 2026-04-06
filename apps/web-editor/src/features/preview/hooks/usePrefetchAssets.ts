import { useMemo, useState, useEffect } from 'react';
import { prefetch } from 'remotion';

/**
 * Prefetches all asset stream URLs into browser memory and returns a merged map
 * where each URL is replaced by its in-memory blob URL once prefetch completes.
 *
 * While a URL is still downloading, the original stream URL is returned for that
 * asset so the Player can start buffering from the server without waiting.
 * Once prefetch resolves, the blob URL replaces the stream URL — eliminating
 * network latency for subsequent seek/play operations.
 *
 * Cleanup revokes blob URLs on unmount or when the input URLs change, preventing
 * memory leaks for assets that are no longer in the project.
 *
 * @param streamUrls - Stable map from assetId to stream URL (keyed by assetId).
 * @returns Map from assetId to blob URL (or stream URL if not yet resolved).
 */
export function usePrefetchAssets(streamUrls: Record<string, string>): Record<string, string> {
  const [blobUrls, setBlobUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    const entries = Object.entries(streamUrls);
    if (entries.length === 0) {
      setBlobUrls({});
      return;
    }

    let isMounted = true;
    const cleanups: Array<() => void> = [];

    entries.forEach(([assetId, streamUrl]) => {
      const { free, waitUntilDone } = prefetch(streamUrl, { method: 'blob-url' });
      cleanups.push(free);
      void waitUntilDone
        .then((blobUrl) => {
          if (isMounted) {
            setBlobUrls((prev) => ({ ...prev, [assetId]: blobUrl }));
          }
        })
        .catch(() => {
          // Prefetch failed — the layer continues using the stream URL.
        });
    });

    return () => {
      isMounted = false;
      cleanups.forEach((free) => free());
      setBlobUrls({});
    };
  }, [streamUrls]);

  // Merge: blob URL overrides stream URL once prefetch resolves.
  return useMemo(() => ({ ...streamUrls, ...blobUrls }), [streamUrls, blobUrls]);
}
