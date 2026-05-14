import { randomUUID } from 'node:crypto';

import type { DraftAspectRatio } from '@ai-video-editor/project-schema';

import {
  ForbiddenError,
  NotFoundError,
  UnprocessableEntityError,
} from '@/lib/errors.js';
import * as aiGenerationService from '@/services/aiGeneration.service.js';
import * as aiGenerationJobRepository from '@/repositories/aiGenerationJob.repository.js';
import * as generationDraftRepository from '@/repositories/generationDraft.repository.js';
import type { GenerationDraft } from '@/repositories/generationDraft.repository.js';
import * as storyboardRepository from '@/repositories/storyboard.repository.js';
import type { StoryboardBlock } from '@/repositories/storyboard.repository.js';
import * as illustrationRepository from '@/repositories/storyboardSceneIllustration.repository.js';
import type {
  StoryboardSceneIllustrationJob,
  StoryboardSceneIllustrationStatus,
} from '@/repositories/storyboardSceneIllustration.repository.js';

export const STORYBOARD_ILLUSTRATION_MODEL_ID = 'openai/gpt-image-2';
export const STORYBOARD_ILLUSTRATION_QUALITY = 'low';

export type StoryboardIllustrationStatusItem = {
  blockId: string;
  status: StoryboardSceneIllustrationStatus;
  jobId: string | null;
  outputFileId: string | null;
  errorMessage: string | null;
};

export type StoryboardIllustrationStatusResponse = {
  items: StoryboardIllustrationStatusItem[];
};

class ActiveIllustrationJobExistsError extends Error {}

function isActiveIllustrationStatus(
  status: StoryboardSceneIllustrationStatus | undefined,
): boolean {
  return status === 'queued' || status === 'running' || status === 'ready';
}

async function resolveDraft(userId: string, draftId: string): Promise<GenerationDraft> {
  const draft = await generationDraftRepository.findDraftById(draftId);
  if (!draft) {
    throw new NotFoundError(`Generation draft ${draftId} not found`);
  }
  if (draft.userId !== userId) {
    throw new ForbiddenError(`You do not own generation draft ${draftId}`);
  }
  return draft;
}

function getDraftAspectRatio(draft: GenerationDraft): DraftAspectRatio {
  const promptDoc = draft.promptDoc;
  if (
    promptDoc &&
    typeof promptDoc === 'object' &&
    'settings' in promptDoc &&
    promptDoc.settings &&
    typeof promptDoc.settings === 'object' &&
    'aspectRatio' in promptDoc.settings
  ) {
    const aspectRatio = promptDoc.settings.aspectRatio;
    if (aspectRatio === '9:16' || aspectRatio === '1:1') {
      return aspectRatio;
    }
  }
  return '16:9';
}

export function buildStoryboardIllustrationOptions(params: {
  prompt: string;
  aspectRatio: DraftAspectRatio;
}): Record<string, unknown> {
  const imageSizeByAspect: Record<DraftAspectRatio, string> = {
    '16:9': 'landscape_16_9',
    '9:16': 'portrait_16_9',
    '1:1': 'square',
  };

  return {
    prompt: params.prompt,
    image_size: imageSizeByAspect[params.aspectRatio],
    quality: STORYBOARD_ILLUSTRATION_QUALITY,
    num_images: 1,
    output_format: 'png',
    sync_mode: false,
  };
}

function buildPrompt(block: StoryboardBlock): string {
  const prompt = block.prompt?.trim();
  if (!prompt) {
    throw new UnprocessableEntityError(`Scene block ${block.id} has no illustration prompt`);
  }
  if (!block.style?.trim()) {
    return prompt;
  }
  return `${prompt}\n\nStyle: ${block.style.trim()}`;
}

function assertPromptedBlocks(blocks: StoryboardBlock[]): void {
  const missing = blocks.find((block) => !block.prompt?.trim());
  if (missing) {
    throw new UnprocessableEntityError(`Scene block ${missing.id} has no illustration prompt`);
  }
}

function requireSceneBlock(
  blocks: StoryboardBlock[],
  blockId: string,
  draftId: string,
): StoryboardBlock {
  const block = blocks.find((candidate) => candidate.id === blockId);
  if (!block) {
    throw new NotFoundError(`Storyboard block ${blockId} not found`);
  }
  if (block.draftId !== draftId || block.blockType !== 'scene') {
    throw new NotFoundError(`Storyboard block ${blockId} not found`);
  }
  return block;
}

async function refreshMapping(
  mapping: StoryboardSceneIllustrationJob,
): Promise<StoryboardSceneIllustrationJob> {
  const aiJob = await aiGenerationJobRepository.getJobById(mapping.aiJobId);
  if (!aiJob) {
    return mapping;
  }

  const nextStatus = illustrationRepository.toSceneIllustrationStatus(aiJob.status);
  if (nextStatus === 'ready' && aiJob.outputFileId) {
    await illustrationRepository.attachIllustrationOutputToBlock({
      id: randomUUID(),
      aiJobId: mapping.aiJobId,
      outputFileId: aiJob.outputFileId,
    });
    return {
      ...mapping,
      status: 'ready',
      outputFileId: aiJob.outputFileId,
      errorMessage: null,
    };
  }

  if (nextStatus !== mapping.status || aiJob.errorMessage !== mapping.errorMessage) {
    await illustrationRepository.updateIllustrationJobStatus({
      aiJobId: mapping.aiJobId,
      status: nextStatus,
      errorMessage: nextStatus === 'failed' ? aiJob.errorMessage : null,
    });
  }

  return {
    ...mapping,
    status: nextStatus,
    errorMessage: nextStatus === 'failed' ? aiJob.errorMessage : null,
  };
}

async function getLatestMappings(
  draftId: string,
): Promise<Map<string, StoryboardSceneIllustrationJob>> {
  const mappings = await illustrationRepository.findLatestIllustrationJobsByDraftId(draftId);
  const refreshed = await Promise.all(mappings.map(refreshMapping));
  return new Map(refreshed.map((mapping) => [mapping.blockId, mapping]));
}

function toStatusResponse(
  sceneBlocks: StoryboardBlock[],
  mappingsByBlock: Map<string, StoryboardSceneIllustrationJob>,
): StoryboardIllustrationStatusResponse {
  return {
    items: sceneBlocks.map((block) => {
      const mapping = mappingsByBlock.get(block.id);
      return {
        blockId: block.id,
        status: mapping?.status ?? 'queued',
        jobId: mapping?.aiJobId ?? null,
        outputFileId: mapping?.outputFileId ?? null,
        errorMessage: mapping?.errorMessage ?? null,
      };
    }),
  };
}

async function createIllustrationJob(params: {
  userId: string;
  draftId: string;
  block: StoryboardBlock;
  aspectRatio: DraftAspectRatio;
}): Promise<void> {
  const prompt = buildPrompt(params.block);
  const options = buildStoryboardIllustrationOptions({
    prompt,
    aspectRatio: params.aspectRatio,
  });

  try {
    await aiGenerationService.submitGeneration(params.userId, {
      modelId: STORYBOARD_ILLUSTRATION_MODEL_ID,
      prompt,
      options,
      draftId: params.draftId,
      beforeEnqueue: async (jobId) => {
        const inserted = await illustrationRepository.createIllustrationJobMapping({
          id: randomUUID(),
          draftId: params.draftId,
          blockId: params.block.id,
          aiJobId: jobId,
          status: 'queued',
        });
        if (!inserted) {
          throw new ActiveIllustrationJobExistsError();
        }
      },
    });
  } catch (error) {
    if (error instanceof ActiveIllustrationJobExistsError) {
      return;
    }
    throw error;
  }
}

export async function listStoryboardIllustrations(
  userId: string,
  draftId: string,
): Promise<StoryboardIllustrationStatusResponse> {
  await resolveDraft(userId, draftId);
  const blocks = await storyboardRepository.findBlocksByDraftId(draftId);
  const sceneBlocks = blocks.filter((block) => block.blockType === 'scene');
  const mappingsByBlock = await getLatestMappings(draftId);
  return toStatusResponse(sceneBlocks, mappingsByBlock);
}

export async function startStoryboardIllustrations(
  userId: string,
  draftId: string,
): Promise<StoryboardIllustrationStatusResponse> {
  const draft = await resolveDraft(userId, draftId);
  const blocks = await storyboardRepository.findBlocksByDraftId(draftId);
  const sceneBlocks = blocks.filter((block) => block.blockType === 'scene');
  const mappingsByBlock = await getLatestMappings(draftId);
  const aspectRatio = getDraftAspectRatio(draft);
  const blocksToCreate = sceneBlocks.filter((block) => {
    const latest = mappingsByBlock.get(block.id);
    return !isActiveIllustrationStatus(latest?.status);
  });

  assertPromptedBlocks(blocksToCreate);

  for (const block of blocksToCreate) {
    await createIllustrationJob({ userId, draftId, block, aspectRatio });
  }

  return listStoryboardIllustrations(userId, draftId);
}

export async function startStoryboardBlockIllustration(
  userId: string,
  draftId: string,
  blockId: string,
): Promise<StoryboardIllustrationStatusResponse> {
  const draft = await resolveDraft(userId, draftId);
  const blocks = await storyboardRepository.findBlocksByDraftId(draftId);
  const block = requireSceneBlock(blocks, blockId, draftId);
  const mappingsByBlock = await getLatestMappings(draftId);
  const latest = mappingsByBlock.get(block.id);

  if (!isActiveIllustrationStatus(latest?.status)) {
    await createIllustrationJob({
      userId,
      draftId,
      block,
      aspectRatio: getDraftAspectRatio(draft),
    });
  }

  return listStoryboardIllustrations(userId, draftId);
}
