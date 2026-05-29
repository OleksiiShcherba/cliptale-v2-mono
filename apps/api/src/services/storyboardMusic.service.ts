import { randomUUID } from 'node:crypto';

import {
  ForbiddenError,
  NotFoundError,
  UnprocessableEntityError,
  ValidationError,
} from '@/lib/errors.js';
import { publishStoryboardStatusUpdated } from '@/lib/realtimePublisher.js';
import * as aiJobRepository from '@/repositories/aiGenerationJob.repository.js';
import * as fileLinksRepository from '@/repositories/fileLinks.repository.js';
import * as fileRepository from '@/repositories/file.repository.js';
import * as draftRepository from '@/repositories/generationDraft.repository.js';
import type { GenerationDraft } from '@/repositories/generationDraft.repository.js';
import * as storyboardRepository from '@/repositories/storyboard.repository.js';
import * as musicRepository from '@/repositories/storyboardMusic.repository.js';
import type {
  StoryboardMusicBlock,
  StoryboardMusicBlockInsert,
} from '@/repositories/storyboardMusic.repository.js';
import { submitGeneration } from '@/services/aiGeneration.service.js';
import { buildStoryboardMusicGenerationOptions } from '@/services/storyboardMusicGenerationOptions.service.js';
import { orderStoryboardSceneBlocks } from '@/services/storyboardGraph.service.js';

const ELEVENLABS_MUSIC_MODEL_ID = 'elevenlabs/music-generation';
const GENERATE_NOW_STEP3_ERROR =
  'Generate this music block in Step 2 before starting Step 3.';

/** Patch shape accepted when updating one storyboard music block. */
export type StoryboardMusicUpdateInput = Partial<
  Omit<StoryboardMusicBlockInsert, 'id' | 'draftId'>
>;

/** Music block returned to API consumers with a resolved generation status. */
export type StoryboardMusicItem = StoryboardMusicBlock & {
  generationStatus: NonNullable<StoryboardMusicBlock['generationStatus']>;
  outputFileId: string | null;
};

/** Collection response for storyboard music endpoints. */
export type StoryboardMusicResponse = { items: StoryboardMusicItem[] };

class ActiveMusicJobExistsError extends Error {}

async function resolveDraft(userId: string, draftId: string): Promise<GenerationDraft> {
  const draft = await draftRepository.findDraftById(draftId);
  if (!draft) throw new NotFoundError(`Generation draft ${draftId} not found`);
  if (draft.userId !== userId) {
    throw new ForbiddenError(`You do not own generation draft ${draftId}`);
  }
  return draft;
}

function toItem(block: StoryboardMusicBlock): StoryboardMusicItem {
  if (block.sourceMode === 'existing' && block.existingFileId) {
    return { ...block, generationStatus: 'ready', outputFileId: block.existingFileId };
  }
  return {
    ...block,
    generationStatus: block.generationStatus ?? 'queued',
    outputFileId: block.outputFileId,
  };
}

function toStep3PendingItem(block: StoryboardMusicBlock): StoryboardMusicItem {
  const item = toItem(block);
  if (block.sourceMode === 'generate_now' && block.generationStatus === null) {
    return {
      ...item,
      generationStatus: 'failed',
      errorMessage: GENERATE_NOW_STEP3_ERROR,
    };
  }
  return item;
}

async function refreshBlock(block: StoryboardMusicBlock): Promise<StoryboardMusicBlock> {
  if (!block.generationJobId) return block;

  const aiJob = await aiJobRepository.getJobById(block.generationJobId);
  if (!aiJob) return block;

  const refreshedBlock = await refreshBlockCompositionPlan(block, aiJob.options);
  const nextStatus = musicRepository.toMusicGenerationStatus(aiJob.status);
  if (nextStatus === 'ready' && aiJob.outputFileId) {
    await musicRepository.setMusicGenerationJobOutput({
      aiJobId: block.generationJobId,
      outputFileId: aiJob.outputFileId,
    });
    await fileLinksRepository.linkFileToDraft(block.draftId, aiJob.outputFileId);
    return {
      ...refreshedBlock,
      generationStatus: 'ready',
      outputFileId: aiJob.outputFileId,
      errorMessage: null,
    };
  }

  if (nextStatus !== block.generationStatus || aiJob.errorMessage !== block.errorMessage) {
    await musicRepository.updateMusicGenerationJobStatus({
      aiJobId: block.generationJobId,
      status: nextStatus,
      errorMessage: nextStatus === 'failed' ? aiJob.errorMessage : null,
    });
  }

  return {
    ...refreshedBlock,
    generationStatus: nextStatus,
    errorMessage: nextStatus === 'failed' ? aiJob.errorMessage : null,
  };
}

async function refreshBlockCompositionPlan(
  block: StoryboardMusicBlock,
  options: Record<string, unknown> | null,
): Promise<StoryboardMusicBlock> {
  const compositionPlan = options?.['composition_plan'];
  if (!compositionPlan || typeof compositionPlan !== 'object' || Array.isArray(compositionPlan)) {
    return block;
  }
  if (JSON.stringify(block.compositionPlan) === JSON.stringify(compositionPlan)) return block;

  await musicRepository.updateMusicBlockCompositionPlan({
    id: block.id,
    draftId: block.draftId,
    compositionPlan: compositionPlan as StoryboardMusicBlockInsert['compositionPlan'],
  });
  return {
    ...block,
    compositionPlan: compositionPlan as StoryboardMusicBlockInsert['compositionPlan'],
  };
}

async function listFreshBlocks(draftId: string): Promise<StoryboardMusicBlock[]> {
  const blocks = await musicRepository.listMusicBlocksByDraftId(draftId);
  return Promise.all(blocks.map(refreshBlock));
}

/** Ensures a referenced existing-track file belongs to the user and is ready audio. */
export async function assertReadyAudioFile(userId: string, fileId: string | null): Promise<void> {
  if (!fileId) throw new ValidationError('existing mode requires existingFileId');
  const file = await fileRepository.findByIdForUser(fileId, userId);
  if (!file || file.kind !== 'audio' || file.status !== 'ready') {
    throw new UnprocessableEntityError(`File ${fileId} is not a ready audio file`);
  }
}

async function assertSceneRange(draftId: string, startId: string, endId: string): Promise<void> {
  const blocks = await storyboardRepository.findBlocksByDraftId(draftId);
  const edges = await storyboardRepository.findEdgesByDraftId(draftId);
  const orderedScenes = orderStoryboardSceneBlocks(blocks, edges);
  const startIndex = orderedScenes.findIndex((block) => block.id === startId);
  const endIndex = orderedScenes.findIndex((block) => block.id === endId);
  if (startIndex < 0) throw new ValidationError(`Music range start scene ${startId} not found`);
  if (endIndex < 0) throw new ValidationError(`Music range end scene ${endId} not found`);
  if (startIndex > endIndex) {
    throw new ValidationError('Music range start scene must not come after end scene');
  }
}

async function enqueueMusicBlock(userId: string, block: StoryboardMusicBlock): Promise<void> {
  const sceneBlocks = await storyboardRepository.findBlocksByDraftId(block.draftId);
  const edges = await storyboardRepository.findEdgesByDraftId(block.draftId);
  const options = buildStoryboardMusicGenerationOptions(block, sceneBlocks, edges);
  const prompt = typeof options['prompt'] === 'string' ? options['prompt'] : undefined;

  await submitGeneration(userId, {
    modelId: ELEVENLABS_MUSIC_MODEL_ID,
    prompt,
    options,
    draftId: block.draftId,
    beforeEnqueue: async (jobId) => {
      await musicRepository.releaseInactiveMusicGenerationLocks({
        draftId: block.draftId,
        musicBlockId: block.id,
      });
      const inserted = await musicRepository.createMusicGenerationJobMapping({
        id: randomUUID(),
        draftId: block.draftId,
        musicBlockId: block.id,
        aiJobId: jobId,
        status: 'queued',
      });
      if (!inserted) throw new ActiveMusicJobExistsError();
    },
  });
}

/** Lists storyboard music blocks for a draft after refreshing latest generation state. */
export async function listStoryboardMusic(
  userId: string,
  draftId: string,
): Promise<StoryboardMusicResponse> {
  await resolveDraft(userId, draftId);
  const blocks = await listFreshBlocks(draftId);
  return { items: blocks.map(toItem) };
}

/** Updates one storyboard music block after validating draft ownership and scene/audio refs. */
export async function updateStoryboardMusicBlock(params: {
  userId: string;
  draftId: string;
  musicBlockId: string;
  patch: StoryboardMusicUpdateInput;
}): Promise<StoryboardMusicItem> {
  await resolveDraft(params.userId, params.draftId);
  const current = (await listFreshBlocks(params.draftId))
    .find((block) => block.id === params.musicBlockId);
  if (!current) throw new NotFoundError(`Music block ${params.musicBlockId} not found`);

  const next: StoryboardMusicBlockInsert = { ...current, ...params.patch };
  await assertSceneRange(params.draftId, next.startSceneBlockId, next.endSceneBlockId);
  if (next.sourceMode === 'existing') {
    await assertReadyAudioFile(params.userId, next.existingFileId);
  } else if (params.patch.existingFileId) {
    await assertReadyAudioFile(params.userId, params.patch.existingFileId);
  }

  const updated = await musicRepository.updateMusicBlock({
    id: params.musicBlockId,
    draftId: params.draftId,
    patch: next,
  });
  if (!updated) throw new NotFoundError(`Music block ${params.musicBlockId} not found`);

  const refreshed = (await listFreshBlocks(params.draftId))
    .find((block) => block.id === params.musicBlockId);
  if (!refreshed) throw new NotFoundError(`Music block ${params.musicBlockId} not found`);
  return toItem(refreshed);
}

/** Enqueues direct generation for one generate-now storyboard music block. */
export async function generateStoryboardMusicBlock(params: {
  userId: string;
  draftId: string;
  musicBlockId: string;
}): Promise<StoryboardMusicResponse> {
  await resolveDraft(params.userId, params.draftId);
  const block = (await listFreshBlocks(params.draftId))
    .find((candidate) => candidate.id === params.musicBlockId);
  if (!block) throw new NotFoundError(`Music block ${params.musicBlockId} not found`);
  if (block.sourceMode !== 'generate_now') {
    throw new ValidationError('Only generate_now music blocks can be generated directly');
  }
  if (block.generationStatus !== 'queued' && block.generationStatus !== 'running') {
    try {
      await enqueueMusicBlock(params.userId, block);
    } catch (error) {
      if (!(error instanceof ActiveMusicJobExistsError)) throw error;
    }
  }
  const status = await listStoryboardMusic(params.userId, params.draftId);
  await publishStoryboardStatusUpdated({
    userId: params.userId,
    draftId: params.draftId,
    payload: {
      resource: 'storyboardMusic',
      status,
    },
  });
  return status;
}

/** Enqueues all pending Step 3 storyboard music blocks for a draft. */
export async function generatePendingStoryboardMusic(params: {
  userId: string;
  draftId: string;
}): Promise<StoryboardMusicResponse> {
  await resolveDraft(params.userId, params.draftId);
  const blocks = await listFreshBlocks(params.draftId);
  const targets = blocks.filter((block) => (
    block.sourceMode === 'generate_on_step3' &&
    block.generationStatus !== 'queued' &&
    block.generationStatus !== 'running' &&
    block.generationStatus !== 'ready'
  ));

  for (const block of targets) {
    try {
      await enqueueMusicBlock(params.userId, block);
    } catch (error) {
      if (!(error instanceof ActiveMusicJobExistsError)) throw error;
    }
  }
  const refreshedBlocks = await listFreshBlocks(params.draftId);
  const status = { items: refreshedBlocks.map(toStep3PendingItem) };
  await publishStoryboardStatusUpdated({
    userId: params.userId,
    draftId: params.draftId,
    payload: {
      resource: 'storyboardMusic',
      status,
    },
  });
  return status;
}
