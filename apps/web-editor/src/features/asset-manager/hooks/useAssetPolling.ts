import { useEffect, useRef } from 'react';

import { getAsset } from '@/features/asset-manager/api';
import type { Asset } from '@/features/asset-manager/types';

const POLL_INTERVAL_MS = 2000;

type UseAssetPollingOptions = {
  /** File ID to poll. Pass `null` to disable polling. */
  fileId: string | null;
  onReady: (asset: Asset) => void;
  onError?: (asset: Asset) => void;
};

/**
 * Polls GET /assets/:id every 2 s until status transitions to `ready` or `error`.
 * Cleans up the interval on unmount or when fileId changes.
 * Callbacks are held in refs so the interval is not restarted on every render.
 */
export function useAssetPolling({ fileId, onReady, onError }: UseAssetPollingOptions): void {
  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onReadyRef.current = onReady;
    onErrorRef.current = onError;
  });

  useEffect(() => {
    if (!fileId) return;

    let active = true;

    const poll = async () => {
      try {
        const asset = await getAsset(fileId);
        if (!active) return;
        if (asset.status === 'ready') {
          active = false;
          onReadyRef.current(asset);
        } else if (asset.status === 'error') {
          active = false;
          onErrorRef.current?.(asset);
        }
      } catch {
        // transient network error — keep polling until next interval
      }
    };

    void poll();
    const id = setInterval(() => void poll(), POLL_INTERVAL_MS);

    return () => {
      active = false;
      clearInterval(id);
    };
  }, [fileId]);
}
