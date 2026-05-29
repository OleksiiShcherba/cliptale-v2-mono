import { randomUUID } from 'node:crypto';

import { AI_MODELS, type AiModel } from '@ai-video-editor/api-contracts';

import {
  ForbiddenError,
  NotFoundError,
  UnprocessableEntityError,
  ValidationError,
} from '@/lib/errors.js';
import { publishStoryboardStatusUpdated } from '@/lib/realtimePublisher.js';
import * as aiGenerationJobRepository from '@/repositories/aiGenerationJob.repository.js';
import * as generationDraftRepository from '@/repositories/generationDraft.repository.js';
import type { GenerationDraft } from '@/repositories/generationDraft.repository.js';
import * as storyboardRepository from '@/repositories/storyboard.repository.js';
import type { StoryboardBlock } from '@/repositories/storyboard.repository.js';
import * as illustrationRepository from '@/repositories/storyboardSceneIllustration.repository.js';
import * as referenceRepository from '@/repositories/storyboardIllustrationReference.repository.js';
import * as videoRepository from '@/repositories/storyboardSceneVideo.repository.js';
import type {
  StoryboardSceneVideoJob,
  StoryboardSceneVideoStatus,
} from '@/repositories/storyboardSceneVideo.repository.js';
import { submitGeneration } from '@/services/aiGeneration.service.js';
import { orderStoryboardSceneBlocks } from '@/services/storyboardGraph.service.js';
import {
  buildStoryboardVideoOptions,
  modelSupportsAudio,
} from '@/services/storyboardVideoOptions.service.js';

export {
  buildStoryboardVideoOptions,
  modelSupportsAudio,
} from '@/services/storyboardVideoOptions.service.js';

export type StoryboardVideoStatusItem = {
  blockId: string;
  status: StoryboardSceneVideoStatus;
  jobId: string | null;
  modelId: string | null;
  generateAudio: boolean;
  outputFileId: string | null;
  errorMessage: string | null;
};

export type StoryboardVideoStatusResponse = {
  items: StoryboardVideoStatusItem[];
};

class ActiveVideoJobExistsError extends Error {
  constructor() {
    super('Active storyboard scene video already exists');
    this.name = 'ActiveVideoJobExistsError';
  }
}

function getModel(modelId: string): AiModel {
  const model = AI_MODELS.find((candidate) => candidate.id === modelId);
  if (!model) {
    throw new ValidationError(`Unknown modelId '${modelId}'`);
  }
  if (model.capability !== 'image_to_video') {
    throw new ValidationError(`Model '${modelId}' is not an Image to Video model`);
  }
  return model;
}

function isActiveStatus(status: StoryboardSceneVideoStatus | undefined): boolean {
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

async function refreshMapping(mapping: StoryboardSceneVideoJob): Promise<StoryboardSceneVideoJob> {
  if (mapping.outputFileId && mapping.status !== 'ready') {
    await videoRepository.setVideoJobOutput({
      aiJobId: mapping.aiJobId,
      outputFileId: mapping.outputFileId,
    });
    return { ...mapping, status: 'ready', errorMessage: null };
  }

  const aiJob = await aiGenerationJobRepository.getJobById(mapping.aiJobId);
  if (!aiJob) {
    return mapping;
  }

  const nextStatus = videoRepository.toSceneVideoStatus(aiJob.status);
  if (nextStatus === 'ready' && aiJob.outputFileId) {
    await videoRepository.setVideoJobOutput({
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
    await videoRepository.updateVideoJobStatus({
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

async function getLatestVideoMappings(
  draftId: string,
): Promise<Map<string, StoryboardSceneVideoJob>> {
  const mappings = await videoRepository.findLatestVideoJobsByDraftId(draftId);
  const refreshed = await Promise.all(mappings.map(refreshMapping));
  return new Map(refreshed.map((mapping) => [mapping.blockId, mapping]));
}

async function getReadyIllustrationFileIds(
  draftId: string,
): Promise<Map<string, string>> {
  const mappings = await illustrationRepository.findLatestIllustrationJobsByDraftId(draftId);
  const result = new Map<string, string>();
  for (const mapping of mappings) {
    if (mapping.status === 'ready' && mapping.outputFileId) {
      result.set(mapping.blockId, mapping.outputFileId);
    }
  }
  return result;
}

function assertVideoPrompts(sceneBlocks: StoryboardBlock[]): void {
  const missing = sceneBlocks.find((block) => !block.videoPrompt?.trim());
  if (missing) {
    throw new UnprocessableEntityError(`Scene block ${missing.id} has no video prompt`);
  }
}

function assertReadyImages(params: {
  sceneBlocks: StoryboardBlock[];
  imageFileIds: Map<string, string>;
}): void {
  const missing = params.sceneBlocks.find((block) => !params.imageFileIds.has(block.id));
  if (missing) {
    throw new UnprocessableEntityError(`Scene block ${missing.id} has no ready generated image`);
  }
}

async function assertPrincipalImageApproved(draftId: string): Promise<void> {
  const reference = await referenceRepository.findLatestReferenceByDraftId(draftId);
  if (
    !reference ||
    reference.status !== 'ready' ||
    !reference.outputFileId ||
    reference.approvalStatus !== 'approved'
  ) {
    throw new UnprocessableEntityError('Principal image must be approved before video generation');
  }
}

function toStatusResponse(
  sceneBlocks: StoryboardBlock[],
  mappingsByBlock: Map<string, StoryboardSceneVideoJob>,
): StoryboardVideoStatusResponse {
  return {
    items: sceneBlocks.map((block) => {
      const mapping = mappingsByBlock.get(block.id);
      return {
        blockId: block.id,
        status: mapping?.status ?? 'queued',
        jobId: mapping?.aiJobId ?? null,
        modelId: mapping?.modelId ?? null,
        generateAudio: mapping?.generateAudio ?? false,
        outputFileId: mapping?.outputFileId ?? null,
        errorMessage: mapping?.errorMessage ?? null,
      };
    }),
  };
}

async function getSceneBlocks(draftId: string): Promise<StoryboardBlock[]> {
  const blocks = await storyboardRepository.findBlocksByDraftId(draftId);
  const edges = await storyboardRepository.findEdgesByDraftId(draftId);
  const sceneBlocks = orderStoryboardSceneBlocks(blocks, edges);
  if (!sceneBlocks.length) {
    throw new UnprocessableEntityError('Storyboard has no scene blocks');
  }
  return sceneBlocks;
}

export async function listStoryboardVideos(
  userId: string,
  draftId: string,
): Promise<StoryboardVideoStatusResponse> {
  await resolveDraft(userId, draftId);
  const sceneBlocks = await getSceneBlocks(draftId);
  const mappingsByBlock = await getLatestVideoMappings(draftId);
  return toStatusResponse(sceneBlocks, mappingsByBlock);
}

export async function startStoryboardVideos(params: {
  userId: string;
  draftId: string;
  modelId: string;
  generateAudio: boolean;
}): Promise<StoryboardVideoStatusResponse> {
  await resolveDraft(params.userId, params.draftId);
  const model = getModel(params.modelId);
  if (params.generateAudio && !modelSupportsAudio(model)) {
    throw new ValidationError(`Model '${model.id}' does not support audio generation`);
  }

  const sceneBlocks = await getSceneBlocks(params.draftId);
  assertVideoPrompts(sceneBlocks);
  await assertPrincipalImageApproved(params.draftId);

  const imageFileIds = await getReadyIllustrationFileIds(params.draftId);
  assertReadyImages({ sceneBlocks, imageFileIds });

  const existingMappings = await getLatestVideoMappings(params.draftId);
  const targets = sceneBlocks.filter((block) => !isActiveStatus(existingMappings.get(block.id)?.status));

  for (const block of targets) {
    const blockIndex = sceneBlocks.findIndex((candidate) => candidate.id === block.id);
    const nextBlock = blockIndex >= 0 ? sceneBlocks[blockIndex + 1] : undefined;
    const imageFileId = imageFileIds.get(block.id)!;
    const nextImageFileId = nextBlock ? imageFileIds.get(nextBlock.id) : undefined;
    const options = buildStoryboardVideoOptions({
      model,
      block,
      imageFileId,
      nextImageFileId,
      generateAudio: params.generateAudio,
    });

    try {
      await submitGeneration(params.userId, {
        modelId: model.id,
        prompt: block.videoPrompt!.trim(),
        options,
        draftId: params.draftId,
        beforeEnqueue: async (jobId) => {
          const inserted = await videoRepository.createVideoJobMapping({
            id: randomUUID(),
            draftId: params.draftId,
            blockId: block.id,
            aiJobId: jobId,
            modelId: model.id,
            generateAudio: params.generateAudio,
            status: 'queued',
          });
          if (!inserted) {
            throw new ActiveVideoJobExistsError();
          }
        },
      });
    } catch (error) {
      if (error instanceof ActiveVideoJobExistsError) {
        continue;
      }
      throw error;
    }
  }

  const status = await listStoryboardVideos(params.userId, params.draftId);
  await publishStoryboardStatusUpdated({
    userId: params.userId,
    draftId: params.draftId,
    payload: {
      resource: 'storyboardVideos',
      status,
    },
  });
  return status;
}
