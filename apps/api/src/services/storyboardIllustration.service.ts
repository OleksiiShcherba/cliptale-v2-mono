import { randomUUID } from 'node:crypto';

import { UnprocessableEntityError, ReferenceNotReadyError, UnlinkedScenesError } from '@/lib/errors.js';
import * as aiGenerationJobRepository from '@/repositories/aiGenerationJob.repository.js';
import * as storyboardRepository from '@/repositories/storyboard.repository.js';
import * as storyboardPlanJobRepository from '@/repositories/storyboardPlanJob.repository.js';
import * as referenceRepository from '@/repositories/storyboardIllustrationReference.repository.js';
import * as referenceBlocksRepository from '@/repositories/storyboardReference.repository.js';
import { enqueueStoryboardOpenAIImage } from '@/queues/jobs/enqueue-storyboard-openai-image.js';
import {
  STORYBOARD_OPENAI_IMAGE_MODEL_ID,
  getOpenAIImageSize,
} from '@/services/storyboardIllustration.config.js';
import {
  createIllustrationJob,
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
// getLatestReference is kept for T6 principal endpoint methods (approveStoryboardPrincipalImage,
// setStoryboardPrincipalImageReferences, editStoryboardPrincipalImage) that are removed in T6.
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
/**
 * Reference-done gate — full-set scope (AC-01/02/04/04b/07, ADR-0002).
 *
 * Every reference block for the draft must have ≥1 completed output (flow_files row).
 * Zero blocks → passes without the unlinked-scenes check (AC-04).
 * If all blocks are ready, checks that every scene is linked (AC-04b).
 * Blocking blocks are named in the error (AC-02); unlinked scenes in theirs (AC-04b).
 *
 * Gate order: readiness → unlinked-scenes (sad §6 Flow 1).
 */
async function assertFullSetReferenceDoneGate(draftId: string): Promise<void> {
  const { isReady, totalBlocks, blockingBlocks } = await referenceBlocksRepository.getDraftReadiness({ draftId });

  if (!isReady) {
    const names = blockingBlocks.map((b) => b.name).join(', ');
    throw new ReferenceNotReadyError(
      `${blockingBlocks.length} reference block${blockingBlocks.length === 1 ? '' : 's'} not yet ready: ${names}. ` +
        'Please wait for generation to finish before starting illustrations.',
      blockingBlocks.map((b) => ({ blockId: b.id, name: b.name })),
    );
  }

  // Zero-block drafts skip the unlinked-scenes check (AC-04): the "every scene must
  // be linked" rule only applies when the draft has ≥1 reference block.
  // totalBlocks may be undefined in unit-test mocks that pre-date this field — treat
  // undefined as "has blocks" to preserve AC-04b behaviour in those tests.
  if (totalBlocks === 0) return;

  const referencelessScenes = await referenceBlocksRepository.getReferencelessScenes({ draftId });
  if (referencelessScenes.length > 0) {
    const names = referencelessScenes.map((s) => s.name ?? s.id).join(', ');
    throw new UnlinkedScenesError(
      `${referencelessScenes.length} scene${referencelessScenes.length === 1 ? '' : 's'} not linked to any reference block: ${names}. ` +
        'Please link every scene to a reference block before starting illustrations.',
      referencelessScenes.map((s) => ({ blockId: s.id, name: s.name ?? null })),
    );
  }
}


/**
 * Reference-done gate — per-scene scope (AC-03, AC-03b, ADR-0002).
 *
 * Only reference blocks linked to the given scene must have ≥1 completed output.
 * Zero linked blocks → passes (getSceneReadiness returns isReady=true).
 */
async function assertSceneReferenceDoneGate(sceneBlockId: string, draftId: string): Promise<void> {
  const { isReady, blockingBlocks } = await referenceBlocksRepository.getSceneReadiness({ sceneBlockId, draftId });

  if (!isReady) {
    const names = blockingBlocks.map((b) => b.name).join(', ');
    throw new ReferenceNotReadyError(
      `${blockingBlocks.length} reference block${blockingBlocks.length === 1 ? '' : 's'} not yet ready: ${names}. ` +
        'Please wait for generation to finish before starting illustrations.',
      blockingBlocks.map((b) => ({ blockId: b.id, name: b.name })),
    );
  }
}

export async function listStoryboardIllustrations(
  userId: string,
  draftId: string,
): Promise<StoryboardIllustrationStatusResponse> {
  await resolveDraft(userId, draftId);
  const blocks = await storyboardRepository.findBlocksByDraftId(draftId);
  const edges = await storyboardRepository.findEdgesByDraftId(draftId);
  const sceneBlocks = orderStoryboardSceneBlocks(blocks, edges);
  const mappingsByBlock = await getLatestMappings(draftId);
  const latestPlanJob = await storyboardPlanJobRepository.findLatestByDraftId(draftId);
  return toStatusResponse(sceneBlocks, mappingsByBlock, latestPlanJob);
}
export async function startStoryboardIllustrations(
  userId: string,
  draftId: string,
): Promise<StoryboardIllustrationStatusResponse> {
  const draft = await resolveDraft(userId, draftId);
  await assertFullSetReferenceDoneGate(draftId);
  const blocks = await storyboardRepository.findBlocksByDraftId(draftId);
  const edges = await storyboardRepository.findEdgesByDraftId(draftId);
  const sceneBlocks = orderStoryboardSceneBlocks(blocks, edges);
  const mappingsByBlock = await getLatestMappings(draftId);
  const aspectRatio = getDraftAspectRatio(draft);
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
      referenceOutputFileId: '',
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
  await assertSceneReferenceDoneGate(blockId, draftId);
  const blocks = await storyboardRepository.findBlocksByDraftId(draftId);
  const block = requireSceneBlock(blocks, blockId, draftId);
  buildPrompt(block);
  const edges = await storyboardRepository.findEdgesByDraftId(draftId);
  const sceneBlocks = orderStoryboardSceneBlocks(blocks, edges);
  const mappingsByBlock = await getLatestMappings(draftId);
  const latest = mappingsByBlock.get(block.id);
  const aspectRatio = getDraftAspectRatio(draft);
  const previousSceneFileId = getPreviousSceneOutputFileId({
    sceneBlocks,
    blockId: block.id,
    mappingsByBlock,
  });
  if (
    previousSceneFileId !== null &&
    !isActiveIllustrationStatus(latest?.status)
  ) {
    await createIllustrationJob({
      userId,
      draftId,
      block,
      aspectRatio,
      referenceOutputFileId: '',
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
