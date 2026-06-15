/**
 * useStoryboardPlanGeneration — STUB retained for type compatibility only.
 *
 * T15: the old client-side orchestration has been retired. This file now only
 * re-exports the result-shape type so that surviving consumers (tests, workspace)
 * continue to compile without modification. No implementation is exported.
 */

import type { StoryboardPlanGenerationStatus } from '@/features/storyboard/types';

export type { StoryboardPlanGenerationStatus };

export type UseStoryboardPlanGenerationResult = {
  status: StoryboardPlanGenerationStatus;
  jobId: string | null;
  error: string | null;
  canvasState: null;
  start: () => Promise<string | null>;
  retry: () => Promise<string | null>;
  reset: () => void;
};
