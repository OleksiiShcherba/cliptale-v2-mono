import type * as referenceRepository from '@/repositories/storyboardIllustrationReference.repository.js';
import type {
  StoryboardSceneIllustrationStatus,
} from '@/repositories/storyboardSceneIllustration.repository.js';

export type StoryboardIllustrationStatusItem = {
  blockId: string;
  status: StoryboardSceneIllustrationStatus;
  jobId: string | null;
  outputFileId: string | null;
  errorMessage: string | null;
};

export type StoryboardIllustrationReferenceStatusItem = {
  status: referenceRepository.StoryboardIllustrationReferenceStatus;
  jobId: string | null;
  outputFileId: string | null;
  sourceReferenceFileIds: string[];
  approvalStatus: 'pending' | 'approved';
  errorMessage: string | null;
};

export type StoryboardAutomationPhase =
  | 'idle'
  | 'planning'
  | 'generating_scene_illustrations'
  | 'ready'
  | 'failed';

export type StoryboardAutomationStatus = {
  phase: StoryboardAutomationPhase;
  planningJobId: string | null;
  errorMessage: string | null;
};

export type StoryboardIllustrationStatusResponse = {
  automation: StoryboardAutomationStatus;
  items: StoryboardIllustrationStatusItem[];
};
