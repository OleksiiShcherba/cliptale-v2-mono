/**
 * useStoryboardHiddenBlocks — session-only Hide state for the two completed
 * storyboard status blocks (AC-02). Hiding is purely in-memory React state:
 * it resets on remount / page reload (Hide is an explicit non-goal to persist),
 * and a block's hidden flag is cleared the moment that block re-enters a
 * generation cycle (its status leaves `completed`) — including indirect
 * restarts — so a re-created block is shown again.
 */

import { useCallback, useEffect, useState } from 'react';

import type {
  StoryboardIllustrationLifecycleStatus,
  StoryboardPlanGenerationStatus,
} from '@/features/storyboard/types';

export type StoryboardStatusBlockKey = 'plan' | 'illustration';

interface UseStoryboardHiddenBlocksParams {
  planStatus: StoryboardPlanGenerationStatus;
  illustrationStatus: StoryboardIllustrationLifecycleStatus;
}

export interface UseStoryboardHiddenBlocksResult {
  isHidden: (key: StoryboardStatusBlockKey) => boolean;
  hide: (key: StoryboardStatusBlockKey) => void;
}

export function useStoryboardHiddenBlocks({
  planStatus,
  illustrationStatus,
}: UseStoryboardHiddenBlocksParams): UseStoryboardHiddenBlocksResult {
  const [hidden, setHidden] = useState<Record<StoryboardStatusBlockKey, boolean>>({
    plan: false,
    illustration: false,
  });

  const hide = useCallback((key: StoryboardStatusBlockKey) => {
    setHidden((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
  }, []);

  // Re-show on a new generation cycle: a block is only ever hidden while it is
  // completed; once its status leaves `completed`, clear the flag so the
  // re-created block reappears when it next completes.
  useEffect(() => {
    if (planStatus !== 'completed') {
      setHidden((prev) => (prev.plan ? { ...prev, plan: false } : prev));
    }
  }, [planStatus]);

  useEffect(() => {
    if (illustrationStatus !== 'completed') {
      setHidden((prev) => (prev.illustration ? { ...prev, illustration: false } : prev));
    }
  }, [illustrationStatus]);

  const isHidden = useCallback(
    (key: StoryboardStatusBlockKey) => hidden[key],
    [hidden],
  );

  return { isHidden, hide };
}
