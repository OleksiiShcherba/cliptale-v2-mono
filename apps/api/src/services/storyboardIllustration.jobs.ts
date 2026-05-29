import { randomUUID } from 'node:crypto';

import type { DraftAspectRatio } from '@ai-video-editor/project-schema';

import * as aiGenerationJobRepository from '@/repositories/aiGenerationJob.repository.js';
import type { GenerationDraft } from '@/repositories/generationDraft.repository.js';
import type { StoryboardBlock } from '@/repositories/storyboard.repository.js';
import * as illustrationRepository from '@/repositories/storyboardSceneIllustration.repository.js';
import * as referenceRepository from '@/repositories/storyboardIllustrationReference.repository.js';
import { enqueueStoryboardOpenAIImage } from '@/queues/jobs/enqueue-storyboard-openai-image.js';
import {
  STORYBOARD_OPENAI_IMAGE_MODEL_ID,
  getOpenAIImageSize,
} from '@/services/storyboardIllustration.config.js';
import { publishStoryboardIllustrationFailure } from '@/services/storyboardIllustration.realtime.js';
import { getLatestReference } from '@/services/storyboardIllustration.status.js';
import {
  buildPrompt,
  buildReferencePrompt,
  resolveDraftImageReferenceFileIds,
} from '@/services/storyboardIllustration.validation.js';

class ActiveIllustrationJobExistsError extends Error {}
class ActiveReferenceJobExistsError extends Error {}

export async function createIllustrationJob(params: {
  userId: string;
  draftId: string;
  block: StoryboardBlock;
  aspectRatio: DraftAspectRatio;
  referenceOutputFileId: string;
  previousSceneFileId?: string;
}): Promise<void> {
  const prompt = buildPrompt(params.block);
  const size = getOpenAIImageSize(params.aspectRatio);
  const jobId = randomUUID();
  const referenceFileIds = [params.referenceOutputFileId];

  await aiGenerationJobRepository.createJob({
    jobId,
    userId: params.userId,
    modelId: STORYBOARD_OPENAI_IMAGE_MODEL_ID,
    capability: 'image_edit',
    prompt,
    options: {
      kind: 'scene',
      blockId: params.block.id,
      referenceFileIds,
      previousSceneFileId: params.previousSceneFileId ?? null,
      size,
    },
  });
  await aiGenerationJobRepository.setDraftId(jobId, params.draftId);

  let mappingInserted = false;
  try {
    mappingInserted = await illustrationRepository.createIllustrationJobMapping({
      id: randomUUID(),
      draftId: params.draftId,
      blockId: params.block.id,
      aiJobId: jobId,
      status: 'queued',
    });
    if (!mappingInserted) throw new ActiveIllustrationJobExistsError();

    await enqueueStoryboardOpenAIImage({
      jobId,
      userId: params.userId,
      draftId: params.draftId,
      kind: 'scene',
      blockId: params.block.id,
      prompt,
      referenceFileIds,
      previousSceneFileId: params.previousSceneFileId,
      size,
    });
  } catch (error) {
    if (error instanceof ActiveIllustrationJobExistsError) {
      await aiGenerationJobRepository.updateJobStatus(
        jobId,
        'failed',
        'Active storyboard scene illustration already exists',
      );
      return;
    }
    const message = error instanceof Error ? error.message : 'Failed to enqueue storyboard scene illustration job';
    await aiGenerationJobRepository.updateJobStatus(jobId, 'failed', message);
    if (mappingInserted) {
      await illustrationRepository.updateIllustrationJobStatus({
        aiJobId: jobId,
        status: 'failed',
        errorMessage: message,
      });
    }
    await publishStoryboardIllustrationFailure({
      userId: params.userId,
      draftId: params.draftId,
      jobId,
      blockId: params.block.id,
      errorMessage: message,
    });
    throw error;
  }
}

async function createReferenceJob(params: {
  userId: string;
  draft: GenerationDraft;
  aspectRatio: DraftAspectRatio;
}): Promise<void> {
  const sourceReferenceFileIds = await resolveDraftImageReferenceFileIds(params.draft);
  const prompt = buildReferencePrompt(params.draft);
  const capability = sourceReferenceFileIds.length > 0 ? 'image_edit' : 'text_to_image';
  const jobId = randomUUID();
  const size = getOpenAIImageSize(params.aspectRatio);

  await aiGenerationJobRepository.createJob({
    jobId,
    userId: params.userId,
    modelId: STORYBOARD_OPENAI_IMAGE_MODEL_ID,
    capability,
    prompt,
    options: {
      kind: 'style_reference',
      sourceReferenceFileIds,
      size,
    },
  });
  await aiGenerationJobRepository.setDraftId(jobId, params.draft.id);

  try {
    const inserted = await referenceRepository.createReferenceMapping({
      id: randomUUID(),
      draftId: params.draft.id,
      aiJobId: jobId,
      sourceReferenceFileIds,
      status: 'queued',
    });
    if (!inserted) throw new ActiveReferenceJobExistsError();

    await enqueueStoryboardOpenAIImage({
      jobId,
      userId: params.userId,
      draftId: params.draft.id,
      kind: 'style_reference',
      prompt,
      referenceFileIds: sourceReferenceFileIds,
      size,
    });
  } catch (error) {
    if (error instanceof ActiveReferenceJobExistsError) {
      await aiGenerationJobRepository.updateJobStatus(jobId, 'failed', 'Active storyboard reference already exists');
      return;
    }
    const message = error instanceof Error ? error.message : 'Failed to enqueue storyboard reference job';
    await aiGenerationJobRepository.updateJobStatus(jobId, 'failed', message);
    await referenceRepository.updateReferenceStatus({
      aiJobId: jobId,
      status: 'failed',
      errorMessage: message,
    });
    await publishStoryboardIllustrationFailure({
      userId: params.userId,
      draftId: params.draft.id,
      jobId,
      errorMessage: message,
    });
    throw error;
  }
}

export async function ensureReadyReference(params: {
  userId: string;
  draft: GenerationDraft;
  aspectRatio: DraftAspectRatio;
}): Promise<referenceRepository.StoryboardIllustrationReference | null> {
  const latestReference = await getLatestReference(params.draft.id);
  if (
    latestReference &&
    (latestReference.status === 'queued' ||
      latestReference.status === 'running' ||
      latestReference.status === 'ready')
  ) {
    return latestReference.status === 'ready' &&
      latestReference.outputFileId &&
      latestReference.approvalStatus === 'approved'
      ? latestReference
      : null;
  }

  await createReferenceJob(params);
  return null;
}
