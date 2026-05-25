import { AI_MODELS, type AiModel } from '@ai-video-editor/api-contracts';

import type { GenerationDraft } from '@/repositories/generationDraft.repository.js';
import type { StoryboardBlock, StoryboardEdge } from '@/repositories/storyboard.repository.js';
import type { StoryboardIllustrationReference } from '@/repositories/storyboardIllustrationReference.repository.js';
import type { StoryboardSceneIllustrationJob } from '@/repositories/storyboardSceneIllustration.repository.js';
import type { StoryboardSceneVideoJob } from '@/repositories/storyboardSceneVideo.repository.js';

export const USER_ID = 'user-1';
export const DRAFT_ID = 'draft-1';
export const LTX_MODEL_ID = 'fal-ai/ltx-2-19b/image-to-video';
export const KLING_MODEL_ID = 'fal-ai/kling-video/o3/standard/image-to-video';
export const PIXVERSE_MODEL_ID = 'fal-ai/pixverse/v6/image-to-video';
export const WAN_MODEL_ID = 'fal-ai/wan/v2.2-a14b/image-to-video';

/** Returns an AI model from the catalog for focused storyboard video tests. */
export function getModel(id: string): AiModel {
  return AI_MODELS.find((model) => model.id === id)!;
}

/** Builds a generation draft fixture with storyboard-compatible defaults. */
export function makeDraft(overrides: Partial<GenerationDraft> = {}): GenerationDraft {
  return {
    id: DRAFT_ID,
    userId: USER_ID,
    promptDoc: { schemaVersion: 1, blocks: [] } as GenerationDraft['promptDoc'],
    status: 'step2',
    createdProjectId: null,
    createdProjectVersionId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

/** Builds a storyboard scene block fixture. */
export function makeBlock(overrides: Partial<StoryboardBlock> = {}): StoryboardBlock {
  return {
    id: 'block-1',
    draftId: DRAFT_ID,
    blockType: 'scene',
    name: 'Scene 01',
    prompt: 'A still image prompt.',
    videoPrompt: 'Push in while the subject turns toward camera.',
    durationS: 6,
    positionX: 0,
    positionY: 0,
    sortOrder: 1,
    style: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    mediaItems: [],
    ...overrides,
  };
}

/** Builds a storyboard edge fixture between two block ids. */
export function makeEdge(sourceBlockId: string, targetBlockId: string): StoryboardEdge {
  return {
    id: `${sourceBlockId}-${targetBlockId}`,
    draftId: DRAFT_ID,
    sourceBlockId,
    targetBlockId,
  };
}

/** Builds a ready storyboard scene illustration mapping fixture. */
export function makeIllustration(
  blockId: string,
  outputFileId: string,
): StoryboardSceneIllustrationJob {
  return {
    id: `illustration-${blockId}`,
    draftId: DRAFT_ID,
    blockId,
    aiJobId: `image-job-${blockId}`,
    status: 'ready',
    outputFileId,
    errorMessage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/** Builds a storyboard scene video mapping fixture. */
export function makeVideoMapping(
  overrides: Partial<StoryboardSceneVideoJob> = {},
): StoryboardSceneVideoJob {
  return {
    id: 'video-map-1',
    draftId: DRAFT_ID,
    blockId: 'block-1',
    aiJobId: 'video-job-1',
    modelId: LTX_MODEL_ID,
    generateAudio: false,
    status: 'queued',
    outputFileId: null,
    errorMessage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/** Builds an approved principal illustration reference fixture. */
export function makeReference(
  overrides: Partial<StoryboardIllustrationReference> = {},
): StoryboardIllustrationReference {
  return {
    id: 'ref-1',
    draftId: DRAFT_ID,
    aiJobId: 'ref-job-1',
    status: 'ready',
    outputFileId: 'ref-file-1',
    sourceReferenceFileIds: [],
    approvalStatus: 'approved',
    approvedAt: new Date(),
    errorMessage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}
