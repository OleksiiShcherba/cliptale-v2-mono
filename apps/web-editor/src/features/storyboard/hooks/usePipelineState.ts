/**
 * usePipelineState — subscribes to pipeline state for a storyboard draft.
 *
 * On mount: fetches the current pipeline state via GET /storyboards/:draftId/pipeline.
 * Realtime: applies storyboard.status.updated events when event.payload.version
 *   is strictly greater than the currently-held version (AC-05 monotonic convergence).
 *   Events with version <= held version are silently dropped.
 * On reconnect: a non-replaying resubscribe delivers no events missed while the
 *   socket was down, so the hook re-GETs the snapshot and converges on the true
 *   backend state (review r3 F4, AC-05 resume-freshness ≤2s). The same version
 *   guard means a stale re-fetch never regresses the held state.
 */

import { useEffect, useRef, useState } from 'react';

import { getPipelineState } from '@/features/storyboard/api';
import type { PipelineState } from '@/features/storyboard/api';
import { useDraftStoryboardStatusSubscription } from '@/shared/hooks/useRealtimeSubscription';

export type { PipelineState };

export function usePipelineState(draftId: string): { state: PipelineState | null } {
  const [state, setState] = useState<PipelineState | null>(null);

  // Keep current version in a ref so the subscription closure always sees the
  // latest value without causing the subscription to re-run on every state update.
  const versionRef = useRef<number>(-Infinity);

  // Apply a snapshot only if strictly newer than the held version (monotonic
  // convergence — shared by the mount fetch, realtime events, and the reconnect
  // re-fetch so none of them can move the UI backwards).
  const applyIfNewer = useRef((snap: PipelineState) => {
    if (snap.version > versionRef.current) {
      versionRef.current = snap.version;
      setState(snap);
    }
  });

  // Fetch on mount
  useEffect(() => {
    let cancelled = false;
    getPipelineState(draftId).then((fetched) => {
      if (cancelled) return;
      applyIfNewer.current(fetched);
    }).catch(() => {
      // Swallow; consumers can detect null state and retry as needed.
    });
    return () => {
      cancelled = true;
    };
  }, [draftId]);

  // Subscribe to realtime updates
  useDraftStoryboardStatusSubscription(draftId, {
    onEvent: (event) => {
      // AC-05: applyIfNewer drops events with version <= held version.
      applyIfNewer.current(event.payload as unknown as PipelineState);
    },
    onReconnect: () => {
      // F4: re-GET the snapshot to recover any transition missed during the drop.
      getPipelineState(draftId)
        .then((fetched) => applyIfNewer.current(fetched))
        .catch(() => {
          // Swallow; a later event or the next reconnect will converge.
        });
    },
  });

  return { state };
}
