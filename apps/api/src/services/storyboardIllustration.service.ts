import { randomUUID } from 'node:crypto';

import type { DraftAspectRatio, PromptBlock } from '@ai-video-editor/project-schema';

import {
  ForbiddenError,
  NotFoundError,
  UnprocessableEntityError,
} from '@/lib/errors.js';
import * as aiGenerationJobRepository from '@/repositories/aiGenerationJob.repository.js';
import * as fileLinksRepository from '@/repositories/fileLinks.repository.js';
import * as generationDraftRepository from '@/repositories/generationDraft.repository.js';
import type { GenerationDraft } from '@/repositories/generationDraft.repository.js';
import * as storyboardRepository from '@/repositories/storyboard.repository.js';
import type { StoryboardBlock, StoryboardEdge } from '@/repositories/storyboard.repository.js';
import * as storyboardPlanJobRepository from '@/repositories/storyboardPlanJob.repository.js';
import type { StoryboardPlanJob } from '@/repositories/storyboardPlanJob.repository.js';
import * as illustrationRepository from '@/repositories/storyboardSceneIllustration.repository.js';
import * as referenceRepository from '@/repositories/storyboardIllustrationReference.repository.js';
import type {
  StoryboardSceneIllustrationJob,
  StoryboardSceneIllustrationStatus,
} from '@/repositories/storyboardSceneIllustration.repository.js';
import { enqueueStoryboardOpenAIImage } from '@/queues/jobs/enqueue-storyboard-openai-image.js';

export const STORYBOARD_ILLUSTRATION_MODEL_ID = 'openai/gpt-image-2';
export const STORYBOARD_OPENAI_IMAGE_MODEL_ID = 'gpt-image-2';
export const STORYBOARD_ILLUSTRATION_QUALITY = 'low';

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
  | 'creating_principal_image'
  | 'awaiting_principal_approval'
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
  reference: StoryboardIllustrationReferenceStatusItem;
  items: StoryboardIllustrationStatusItem[];
};

class ActiveIllustrationJobExistsError extends Error {}
class ActiveReferenceJobExistsError extends Error {}

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

function getOpenAIImageSize(aspectRatio: DraftAspectRatio): '1536x1024' | '1024x1536' | '1024x1024' {
  if (aspectRatio === '9:16') return '1024x1536';
  if (aspectRatio === '1:1') return '1024x1024';
  return '1536x1024';
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

function getDraftTextPrompt(draft: GenerationDraft): string {
  return draft.promptDoc.blocks
    .filter((block): block is Extract<PromptBlock, { type: 'text' }> => block.type === 'text')
    .map((block) => block.value.trim())
    .filter(Boolean)
    .join('\n\n');
}

function buildReferencePrompt(draft: GenerationDraft): string {
  const text = getDraftTextPrompt(draft);
  const style = draft.promptDoc.settings?.styleKey;
  const styleLine = style ? `\n\nStyle: ${style}` : '';
  return [
    'Create one canonical visual style reference image for a storyboard sequence.',
    'It must establish the shared character language, lighting, palette, composition, and visual tone for all later scene images.',
    text ? `Storyboard brief:\n${text}` : 'Storyboard brief: infer a polished visual direction from the available references.',
    `${styleLine}`,
  ].join('\n\n').trim();
}

async function resolveDraftImageReferenceFileIds(
  draft: GenerationDraft,
): Promise<string[]> {
  const promptImageRefs = draft.promptDoc.blocks
    .filter((block): block is Extract<PromptBlock, { type: 'media-ref' }> => (
      block.type === 'media-ref' && block.mediaType === 'image'
    ))
    .map((block) => block.fileId);
  const uniquePromptRefs = [...new Set(promptImageRefs)];
  if (!uniquePromptRefs.length) {
    return [];
  }

  const linkedFiles = await fileLinksRepository.findFilesByDraftId(draft.id);
  const linkedImageIds = new Set(
    linkedFiles
      .filter((file) => file.userId === draft.userId && file.kind === 'image' && file.status === 'ready')
      .map((file) => file.fileId),
  );
  const missing = uniquePromptRefs.find((fileId) => !linkedImageIds.has(fileId));
  if (missing) {
    throw new UnprocessableEntityError(`Image reference file ${missing} is not available on this draft`);
  }
  return uniquePromptRefs;
}

async function assertReadyDraftImageFileIds(params: {
  draft: GenerationDraft;
  fileIds: string[];
}): Promise<string[]> {
  const uniqueFileIds = [...new Set(params.fileIds)];
  if (!uniqueFileIds.length) {
    return [];
  }

  const linkedFiles = await fileLinksRepository.findFilesByDraftId(params.draft.id);
  const linkedReadyImages = new Set(
    linkedFiles
      .filter((file) => file.userId === params.draft.userId && file.kind === 'image' && file.status === 'ready')
      .map((file) => file.fileId),
  );
  const missing = uniqueFileIds.find((fileId) => !linkedReadyImages.has(fileId));
  if (missing) {
    throw new UnprocessableEntityError(`Image file ${missing} is not available on this draft`);
  }
  return uniqueFileIds;
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

function orderSceneBlocks(
  blocks: StoryboardBlock[],
  edges: StoryboardEdge[],
): StoryboardBlock[] {
  const sceneBlocks = blocks
    .filter((block) => block.blockType === 'scene')
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const start = blocks.find((block) => block.blockType === 'start');
  if (!start || sceneBlocks.length === 0) {
    return sceneBlocks;
  }

  const blockById = new Map(blocks.map((block) => [block.id, block]));
  const outgoingBySource = new Map<string, StoryboardEdge[]>();
  for (const edge of edges) {
    const outgoing = outgoingBySource.get(edge.sourceBlockId) ?? [];
    outgoing.push(edge);
    outgoingBySource.set(edge.sourceBlockId, outgoing);
  }

  const ordered: StoryboardBlock[] = [];
  const visited = new Set<string>();
  let currentId = start.id;

  while (!visited.has(currentId)) {
    visited.add(currentId);
    const outgoing = outgoingBySource.get(currentId);
    if (!outgoing || outgoing.length !== 1) {
      break;
    }
    const next = blockById.get(outgoing[0]!.targetBlockId);
    if (!next) {
      break;
    }
    if (next.blockType === 'end') {
      break;
    }
    if (next.blockType === 'scene') {
      ordered.push(next);
    }
    currentId = next.id;
  }

  return ordered.length === sceneBlocks.length ? ordered : sceneBlocks;
}

async function refreshMapping(
  mapping: StoryboardSceneIllustrationJob,
): Promise<StoryboardSceneIllustrationJob> {
  if (mapping.outputFileId && mapping.status !== 'ready') {
    await illustrationRepository.setIllustrationJobOutput({
      aiJobId: mapping.aiJobId,
      outputFileId: mapping.outputFileId,
    });
    return {
      ...mapping,
      status: 'ready',
      errorMessage: null,
    };
  }

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

async function refreshReference(
  reference: referenceRepository.StoryboardIllustrationReference,
): Promise<referenceRepository.StoryboardIllustrationReference> {
  if (reference.outputFileId && reference.status !== 'ready') {
    await referenceRepository.setReferenceOutput({
      aiJobId: reference.aiJobId,
      outputFileId: reference.outputFileId,
    });
    return {
      ...reference,
      status: 'ready',
      errorMessage: null,
      approvalStatus: 'pending',
      approvedAt: null,
    };
  }

  if (reference.status === 'ready' && reference.outputFileId) {
    return reference;
  }

  const aiJob = await aiGenerationJobRepository.getJobById(reference.aiJobId);
  if (!aiJob) {
    return reference;
  }

  const nextStatus = referenceRepository.toStoryboardIllustrationReferenceStatus(aiJob.status);
  if (nextStatus === 'ready' && aiJob.outputFileId) {
    await referenceRepository.setReferenceOutput({
      aiJobId: reference.aiJobId,
      outputFileId: aiJob.outputFileId,
    });
    return {
      ...reference,
      status: 'ready',
      outputFileId: aiJob.outputFileId,
      errorMessage: null,
      approvalStatus: 'pending',
      approvedAt: null,
    };
  }

  if (nextStatus !== reference.status || aiJob.errorMessage !== reference.errorMessage) {
    await referenceRepository.updateReferenceStatus({
      aiJobId: reference.aiJobId,
      status: nextStatus,
      errorMessage: nextStatus === 'failed' ? aiJob.errorMessage : null,
    });
  }

  return {
    ...reference,
    status: nextStatus,
    approvalStatus: nextStatus === 'failed' ? 'pending' : reference.approvalStatus,
    approvedAt: nextStatus === 'failed' ? null : reference.approvedAt,
    errorMessage: nextStatus === 'failed' ? aiJob.errorMessage : null,
  };
}

async function getLatestReference(
  draftId: string,
): Promise<referenceRepository.StoryboardIllustrationReference | null> {
  const reference = await referenceRepository.findLatestReferenceByDraftId(draftId);
  return reference ? refreshReference(reference) : null;
}

function toStatusResponse(
  sceneBlocks: StoryboardBlock[],
  mappingsByBlock: Map<string, StoryboardSceneIllustrationJob>,
  reference: referenceRepository.StoryboardIllustrationReference | null,
  latestPlanJob: StoryboardPlanJob | null,
): StoryboardIllustrationStatusResponse {
  const items = sceneBlocks.map((block) => {
    const mapping = mappingsByBlock.get(block.id);
    return {
      blockId: block.id,
      status: mapping?.status ?? 'queued',
      jobId: mapping?.aiJobId ?? null,
      outputFileId: mapping?.outputFileId ?? null,
      errorMessage: mapping?.errorMessage ?? null,
    };
  });

  return {
    automation: {
      phase: getAutomationPhase({ sceneBlocks, items, reference, latestPlanJob }),
      planningJobId:
        latestPlanJob && ['queued', 'running', 'completed', 'failed'].includes(latestPlanJob.status)
          ? latestPlanJob.jobId
          : null,
      errorMessage: getAutomationErrorMessage({ items, reference, latestPlanJob }),
    },
    reference: reference
      ? {
          status: reference.status,
          jobId: reference.aiJobId,
          outputFileId: reference.outputFileId,
          sourceReferenceFileIds: reference.sourceReferenceFileIds,
          approvalStatus: reference.approvalStatus,
          errorMessage: reference.errorMessage,
        }
      : {
          status: 'queued',
          jobId: null,
          outputFileId: null,
          sourceReferenceFileIds: [],
          approvalStatus: 'pending',
          errorMessage: null,
        },
    items,
  };
}

function getAutomationPhase(params: {
  sceneBlocks: StoryboardBlock[];
  items: StoryboardIllustrationStatusItem[];
  reference: referenceRepository.StoryboardIllustrationReference | null;
  latestPlanJob: StoryboardPlanJob | null;
}): StoryboardAutomationPhase {
  if (params.latestPlanJob?.status === 'queued' || params.latestPlanJob?.status === 'running') {
    return 'planning';
  }

  if (params.latestPlanJob?.status === 'failed' && params.sceneBlocks.length === 0) {
    return 'failed';
  }

  if (params.reference?.status === 'failed' || params.items.some((item) => item.status === 'failed')) {
    return 'failed';
  }

  if (params.reference?.status === 'queued' || params.reference?.status === 'running') {
    return 'creating_principal_image';
  }

  if (
    params.items.some(
      (item) => item.jobId && (item.status === 'queued' || item.status === 'running'),
    )
  ) {
    return 'generating_scene_illustrations';
  }

  if (
    params.reference?.status === 'ready' &&
    params.reference.outputFileId &&
    params.reference.approvalStatus !== 'approved'
  ) {
    return 'awaiting_principal_approval';
  }

  if (
    params.reference?.status === 'ready' &&
    params.reference.outputFileId &&
    params.reference.approvalStatus === 'approved' &&
    params.sceneBlocks.length > 0 &&
    params.items.every((item) => item.status === 'ready')
  ) {
    return 'ready';
  }

  return 'idle';
}

function getAutomationErrorMessage(params: {
  items: StoryboardIllustrationStatusItem[];
  reference: referenceRepository.StoryboardIllustrationReference | null;
  latestPlanJob: StoryboardPlanJob | null;
}): string | null {
  if (params.latestPlanJob?.status === 'failed') {
    return params.latestPlanJob.errorMessage ?? 'Storyboard planning failed';
  }
  if (params.reference?.status === 'failed') {
    return params.reference.errorMessage ?? 'Principal image generation failed';
  }
  const failedScene = params.items.find((item) => item.status === 'failed');
  return failedScene?.errorMessage ?? null;
}

function getReadyOutputFileId(
  mapping: StoryboardSceneIllustrationJob | undefined,
): string | null {
  if (mapping?.status !== 'ready' || !mapping.outputFileId) {
    return null;
  }
  return mapping.outputFileId;
}

function getNextSceneToCreate(params: {
  sceneBlocks: StoryboardBlock[];
  mappingsByBlock: Map<string, StoryboardSceneIllustrationJob>;
}): { block: StoryboardBlock; previousSceneFileId?: string } | null {
  let previousSceneFileId: string | undefined;

  for (const block of params.sceneBlocks) {
    const latest = params.mappingsByBlock.get(block.id);
    const readyOutputFileId = getReadyOutputFileId(latest);
    if (readyOutputFileId) {
      previousSceneFileId = readyOutputFileId;
      continue;
    }

    if (isActiveIllustrationStatus(latest?.status)) {
      return null;
    }

    return { block, previousSceneFileId };
  }

  return null;
}

function getPreviousSceneOutputFileId(params: {
  sceneBlocks: StoryboardBlock[];
  blockId: string;
  mappingsByBlock: Map<string, StoryboardSceneIllustrationJob>;
}): string | undefined | null {
  const index = params.sceneBlocks.findIndex((block) => block.id === params.blockId);
  if (index <= 0) {
    return undefined;
  }

  const previous = params.sceneBlocks[index - 1]!;
  return getReadyOutputFileId(params.mappingsByBlock.get(previous.id));
}

async function createIllustrationJob(params: {
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
    if (!mappingInserted) {
      throw new ActiveIllustrationJobExistsError();
    }

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

  await aiGenerationJobRepository.createJob({
    jobId,
    userId: params.userId,
    modelId: STORYBOARD_OPENAI_IMAGE_MODEL_ID,
    capability,
    prompt,
    options: {
      kind: 'style_reference',
      sourceReferenceFileIds,
      size: getOpenAIImageSize(params.aspectRatio),
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
    if (!inserted) {
      throw new ActiveReferenceJobExistsError();
    }

    await enqueueStoryboardOpenAIImage({
      jobId,
      userId: params.userId,
      draftId: params.draft.id,
      kind: 'style_reference',
      prompt,
      referenceFileIds: sourceReferenceFileIds,
      size: getOpenAIImageSize(params.aspectRatio),
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
    throw error;
  }
}

async function ensureReadyReference(params: {
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

export async function listStoryboardIllustrations(
  userId: string,
  draftId: string,
): Promise<StoryboardIllustrationStatusResponse> {
  await resolveDraft(userId, draftId);
  const reference = await getLatestReference(draftId);
  const blocks = await storyboardRepository.findBlocksByDraftId(draftId);
  const edges = await storyboardRepository.findEdgesByDraftId(draftId);
  const sceneBlocks = orderSceneBlocks(blocks, edges);
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
  const sceneBlocks = orderSceneBlocks(blocks, edges);
  const mappingsByBlock = await getLatestMappings(draftId);
  const aspectRatio = getDraftAspectRatio(draft);
  const reference = await ensureReadyReference({ userId, draft, aspectRatio });
  if (!reference?.outputFileId) {
    return listStoryboardIllustrations(userId, draftId);
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
  buildPrompt(block);
  const edges = await storyboardRepository.findEdgesByDraftId(draftId);
  const sceneBlocks = orderSceneBlocks(blocks, edges);
  const mappingsByBlock = await getLatestMappings(draftId);
  const latest = mappingsByBlock.get(block.id);
  const reference = await ensureReadyReference({
    userId,
    draft,
    aspectRatio: getDraftAspectRatio(draft),
  });
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
      aspectRatio: getDraftAspectRatio(draft),
      referenceOutputFileId: reference.outputFileId,
      previousSceneFileId,
    });
  }

  return listStoryboardIllustrations(userId, draftId);
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

  return listStoryboardIllustrations(userId, draftId);
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
  return listStoryboardIllustrations(userId, draftId);
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
  return listStoryboardIllustrations(userId, draftId);
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

  await aiGenerationJobRepository.createJob({
    jobId,
    userId: params.userId,
    modelId: STORYBOARD_OPENAI_IMAGE_MODEL_ID,
    capability: 'image_edit',
    prompt,
    options: {
      kind: 'style_reference',
      sourceReferenceFileIds,
      size: getOpenAIImageSize(getDraftAspectRatio(draft)),
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
      size: getOpenAIImageSize(getDraftAspectRatio(draft)),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to enqueue storyboard reference edit job';
    await aiGenerationJobRepository.updateJobStatus(jobId, 'failed', message);
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

  return listStoryboardIllustrations(params.userId, params.draftId);
}
