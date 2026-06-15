/**
 * usePipelineState — subscribes to pipeline state for a storyboard draft.
 *
 * On mount: fetches the current pipeline state via GET /storyboards/:draftId/pipeline.
 * Realtime: applies storyboard.status.updated events when event.payload.version
 *   is strictly greater than the currently-held version (AC-05 monotonic convergence).
 *   Events with version <= held version are silently dropped.
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

  // Fetch on mount
  useEffect(() => {
    let cancelled = false;
    getPipelineState(draftId).then((fetched) => {
      if (cancelled) return;
      versionRef.current = fetched.version;
      setState(fetched);
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
      const incoming = event.payload as unknown as PipelineState;
      if (incoming.version > versionRef.current) {
        versionRef.current = incoming.version;
        setState(incoming);
      }
      // AC-05: drop events with version <= held version
    },
  });

  return { state };
}
