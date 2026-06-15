/**
 * useStoryboardIllustrations — STUB retained for type compatibility only.
 *
 * T15: the old client-side orchestration has been retired. This file now only
 * re-exports the result-shape types so that surviving consumers (tests, workspace)
 * continue to compile without modification. No implementation is exported.
 */

import type { GateErrorDetails } from '@/features/storyboard/api';
import type {
  StoryboardIllustrationLifecyclePhase,
  StoryboardIllustrationLifecycleStatus,
  StoryboardIllustrationStatusItem,
} from '@/features/storyboard/types';

export interface StructuredGateError {
  code: string;
  details: GateErrorDetails;
  message: string;
}

export type UseStoryboardIllustrationsResult = {
  status: StoryboardIllustrationLifecycleStatus;
  phase: StoryboardIllustrationLifecyclePhase;
  error: string | null;
  gateError: StructuredGateError | null;
  items: StoryboardIllustrationStatusItem[];
  byBlockId: Map<string, StoryboardIllustrationStatusItem>;
  isBlocking: boolean;
  start: () => Promise<void>;
  retryBlock: (blockId: string) => Promise<void>;
  refresh: () => Promise<StoryboardIllustrationStatusItem[]>;
};
