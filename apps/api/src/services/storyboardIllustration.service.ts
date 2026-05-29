import { randomUUID } from 'node:crypto';

import { UnprocessableEntityError } from '@/lib/errors.js';
import * as aiGenerationJobRepository from '@/repositories/aiGenerationJob.repository.js';
import * as storyboardRepository from '@/repositories/storyboard.repository.js';
import * as storyboardPlanJobRepository from '@/repositories/storyboardPlanJob.repository.js';
import * as referenceRepository from '@/repositories/storyboardIllustrationReference.repository.js';
import { enqueueStoryboardOpenAIImage } from '@/queues/jobs/enqueue-storyboard-openai-image.js';
import {
  STORYBOARD_OPENAI_IMAGE_MODEL_ID,
  getOpenAIImageSize,
} from '@/services/storyboardIllustration.config.js';
import {
  createIllustrationJob,
  ensureReadyReference,
} from '@/services/storyboardIllustration.jobs.js';
import {
  publishStoryboardIllustrationFailure,
  publishStoryboardIllustrationStatus,
} from '@/services/storyboardIllustration.realtime.js';
import {
  getLatestMappings,
  getLatestReference,
  getNextSceneToCreate,
  getPreviousSceneOutputFileId,
  isActiveIllustrationStatus,
  toStatusResponse,
} from '@/services/storyboardIllustration.status.js';
import type { StoryboardIllustrationStatusResponse } from '@/services/storyboardIllustration.types.js';
import {
  assertPromptedBlocks,
  assertReadyDraftImageFileIds,
  buildPrompt,
  getDraftAspectRatio,
  requireSceneBlock,
  resolveDraft,
} from '@/services/storyboardIllustration.validation.js';
import { orderStoryboardSceneBlocks } from '@/services/storyboardGraph.service.js';
export {
  STORYBOARD_ILLUSTRATION_MODEL_ID,
  STORYBOARD_ILLUSTRATION_QUALITY,
  STORYBOARD_OPENAI_IMAGE_MODEL_ID,
  buildStoryboardIllustrationOptions,
} from '@/services/storyboardIllustration.config.js';
export type {
  StoryboardAutomationPhase, StoryboardAutomationStatus, StoryboardIllustrationReferenceStatusItem,
  StoryboardIllustrationStatusItem, StoryboardIllustrationStatusResponse,
} from '@/services/storyboardIllustration.types.js';
export async function listStoryboardIllustrations(
  userId: string,
  draftId: string,
): Promise<StoryboardIllustrationStatusResponse> {
  await resolveDraft(userId, draftId);
  const reference = await getLatestReference(draftId);
  const blocks = await storyboardRepository.findBlocksByDraftId(draftId);
  const edges = await storyboardRepository.findEdgesByDraftId(draftId);
  const sceneBlocks = orderStoryboardSceneBlocks(blocks, edges);
  const mappingsByBlock = await getLatestMappings(draftId);
  const latestPlanJob = await storyboardPlanJobRepository.findLatestByDraftId(draftId);
  return toStatusResponse(sceneBlocks, mappingsByBlock, reference, latestPlanJob);
}
export async function startStoryboardIllustrations(
  userId: string,
  draftId: string,
): Promise<StoryboardIllustrationStatusResponse> {
  const draft = await resolveDraft(userId, draftId);
  const blocks = await storyboardRepository.findBlocksByDraftId(draftId);
  const edges = await storyboardRepository.findEdgesByDraftId(draftId);
  const sceneBlocks = orderStoryboardSceneBlocks(blocks, edges);
  const mappingsByBlock = await getLatestMappings(draftId);
  const aspectRatio = getDraftAspectRatio(draft);
  const reference = await ensureReadyReference({ userId, draft, aspectRatio });
  if (!reference?.outputFileId) {
    const status = await listStoryboardIllustrations(userId, draftId);
    await publishStoryboardIllustrationStatus({ userId, draftId, status });
    return status;
  }
  const blocksToCreate = sceneBlocks.filter((block) => {
    const latest = mappingsByBlock.get(block.id);
    return !isActiveIllustrationStatus(latest?.status);
  });
  assertPromptedBlocks(blocksToCreate);
  const next = getNextSceneToCreate({ sceneBlocks, mappingsByBlock });
  if (next) {
    await createIllustrationJob({
      userId,
      draftId,
      block: next.block,
      aspectRatio,
      referenceOutputFileId: reference.outputFileId,
      previousSceneFileId: next.previousSceneFileId,
    });
  }

  const status = await listStoryboardIllustrations(userId, draftId);
  await publishStoryboardIllustrationStatus({ userId, draftId, status });
  return status;
}
export async function startStoryboardBlockIllustration(
  userId: string,
  draftId: string,
  blockId: string,
): Promise<StoryboardIllustrationStatusResponse> {
  const draft = await resolveDraft(userId, draftId);
  const blocks = await storyboardRepository.findBlocksByDraftId(draftId);
  const block = requireSceneBlock(blocks, blockId, draftId);
  buildPrompt(block);
  const edges = await storyboardRepository.findEdgesByDraftId(draftId);
  const sceneBlocks = orderStoryboardSceneBlocks(blocks, edges);
  const mappingsByBlock = await getLatestMappings(draftId);
  const latest = mappingsByBlock.get(block.id);
  const aspectRatio = getDraftAspectRatio(draft);
  const reference = await ensureReadyReference({ userId, draft, aspectRatio });
  const previousSceneFileId = getPreviousSceneOutputFileId({
    sceneBlocks,
    blockId: block.id,
    mappingsByBlock,
  });
  if (
    reference?.outputFileId &&
    previousSceneFileId !== null &&
    !isActiveIllustrationStatus(latest?.status)
  ) {
    await createIllustrationJob({
      userId,
      draftId,
      block,
      aspectRatio,
      referenceOutputFileId: reference.outputFileId,
      previousSceneFileId,
    });
  }

  const status = await listStoryboardIllustrations(userId, draftId);
  await publishStoryboardIllustrationStatus({ userId, draftId, status });
  return status;
}
export async function approveStoryboardPrincipalImage(
  userId: string,
  draftId: string,
): Promise<StoryboardIllustrationStatusResponse> {
  await resolveDraft(userId, draftId);
  const reference = await getLatestReference(draftId);
  if (!reference || reference.status !== 'ready' || !reference.outputFileId) {
    throw new UnprocessableEntityError('No ready principal image exists for this storyboard');
  }
  const approved = await referenceRepository.approveReference({
    draftId,
    referenceId: reference.id,
  });
  if (!approved) {
    throw new UnprocessableEntityError('Principal image is not available for approval');
  }
  const status = await listStoryboardIllustrations(userId, draftId);
  await publishStoryboardIllustrationStatus({ userId, draftId, status });
  return status;
}
export async function setStoryboardPrincipalImageReferences(
  userId: string,
  draftId: string,
  fileIds: string[],
): Promise<StoryboardIllustrationStatusResponse> {
  const draft = await resolveDraft(userId, draftId);
  const reference = await getLatestReference(draftId);
  if (!reference || reference.status !== 'ready' || !reference.outputFileId) {
    throw new UnprocessableEntityError('No ready principal image exists for this storyboard');
  }
  const sourceReferenceFileIds = await assertReadyDraftImageFileIds({ draft, fileIds });
  const updated = await referenceRepository.updateSourceReferenceFileIds({
    draftId,
    referenceId: reference.id,
    sourceReferenceFileIds,
  });
  if (!updated) {
    throw new UnprocessableEntityError('Principal image references could not be updated');
  }
  const status = await listStoryboardIllustrations(userId, draftId);
  await publishStoryboardIllustrationStatus({ userId, draftId, status });
  return status;
}
export async function replaceStoryboardPrincipalImage(
  userId: string,
  draftId: string,
  fileId: string,
): Promise<StoryboardIllustrationStatusResponse> {
  const draft = await resolveDraft(userId, draftId);
  const [readyFileId] = await assertReadyDraftImageFileIds({ draft, fileIds: [fileId] });
  const jobId = randomUUID();
  await aiGenerationJobRepository.createJob({
    jobId,
    userId,
    modelId: STORYBOARD_OPENAI_IMAGE_MODEL_ID,
    capability: 'image_edit',
    prompt: 'User selected replacement principal image.',
    options: { kind: 'style_reference_replacement', sourceReferenceFileIds: [readyFileId] },
  });
  await aiGenerationJobRepository.setDraftId(jobId, draftId);
  await aiGenerationJobRepository.setOutputFile(jobId, readyFileId);
  await referenceRepository.deactivateActiveReference(draftId);
  const inserted = await referenceRepository.createReferenceMapping({
    id: randomUUID(),
    draftId,
    aiJobId: jobId,
    sourceReferenceFileIds: [readyFileId],
    status: 'ready',
  });
  if (!inserted) {
    await aiGenerationJobRepository.updateJobStatus(jobId, 'failed', 'Active storyboard reference already exists');
    throw new UnprocessableEntityError('Active principal image already exists');
  }
  await referenceRepository.setReferenceOutput({ aiJobId: jobId, outputFileId: readyFileId });
  const status = await listStoryboardIllustrations(userId, draftId);
  await publishStoryboardIllustrationStatus({ userId, draftId, status });
  return status;
}
export async function editStoryboardPrincipalImage(params: {
  userId: string;
  draftId: string;
  prompt: string;
  extraReferenceFileIds?: string[];
}): Promise<StoryboardIllustrationStatusResponse> {
  const draft = await resolveDraft(params.userId, params.draftId);
  const prompt = params.prompt.trim();
  if (!prompt) {
    throw new UnprocessableEntityError('Principal image edit prompt is required');
  }
  const reference = await getLatestReference(params.draftId);
  if (!reference || reference.status !== 'ready' || !reference.outputFileId) {
    throw new UnprocessableEntityError('No ready principal image exists for this storyboard');
  }
  const extraReferenceFileIds = await assertReadyDraftImageFileIds({
    draft,
    fileIds: params.extraReferenceFileIds ?? [],
  });
  const sourceReferenceFileIds = [...new Set([...reference.sourceReferenceFileIds, ...extraReferenceFileIds])];
  const jobId = randomUUID();
  const referenceFileIds = [...new Set([reference.outputFileId, ...sourceReferenceFileIds])];
  const size = getOpenAIImageSize(getDraftAspectRatio(draft));

  await aiGenerationJobRepository.createJob({
    jobId,
    userId: params.userId,
    modelId: STORYBOARD_OPENAI_IMAGE_MODEL_ID,
    capability: 'image_edit',
    prompt,
    options: {
      kind: 'style_reference',
      sourceReferenceFileIds,
      size,
    },
  });
  await aiGenerationJobRepository.setDraftId(jobId, params.draftId);
  try {
    await enqueueStoryboardOpenAIImage({
      jobId,
      userId: params.userId,
      draftId: params.draftId,
      kind: 'style_reference',
      prompt,
      referenceFileIds,
      size,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to enqueue storyboard reference edit job';
    await aiGenerationJobRepository.updateJobStatus(jobId, 'failed', message);
    await publishStoryboardIllustrationFailure({
      userId: params.userId,
      draftId: params.draftId,
      jobId,
      errorMessage: message,
    });
    throw error;
  }

  await referenceRepository.deactivateActiveReference(params.draftId);
  const inserted = await referenceRepository.createReferenceMapping({
    id: randomUUID(),
    draftId: params.draftId,
    aiJobId: jobId,
    sourceReferenceFileIds,
    status: 'queued',
  });
  if (!inserted) {
    await aiGenerationJobRepository.updateJobStatus(jobId, 'failed', 'Active storyboard reference already exists');
    throw new UnprocessableEntityError('Active principal image already exists');
  }

  const status = await listStoryboardIllustrations(params.userId, params.draftId);
  await publishStoryboardIllustrationStatus({
    userId: params.userId,
    draftId: params.draftId,
    status,
  });
  return status;
}
