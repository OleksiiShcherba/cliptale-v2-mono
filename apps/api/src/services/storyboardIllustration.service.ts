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
  errorMessage: string | null;
};

export type StoryboardIllustrationStatusResponse = {
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
    };
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
): StoryboardIllustrationStatusResponse {
  return {
    reference: reference
      ? {
          status: reference.status,
          jobId: reference.aiJobId,
          outputFileId: reference.outputFileId,
          sourceReferenceFileIds: reference.sourceReferenceFileIds,
          errorMessage: reference.errorMessage,
        }
      : {
          status: 'queued',
          jobId: null,
          outputFileId: null,
          sourceReferenceFileIds: [],
          errorMessage: null,
        },
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
    return latestReference.status === 'ready' && latestReference.outputFileId
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
  return toStatusResponse(sceneBlocks, mappingsByBlock, reference);
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
  const blocksToCreate = sceneBlocks.filter((block) => {
    const latest = mappingsByBlock.get(block.id);
    return !isActiveIllustrationStatus(latest?.status);
  });

  assertPromptedBlocks(blocksToCreate);

  const reference = await ensureReadyReference({ userId, draft, aspectRatio });
  if (!reference?.outputFileId) {
    return listStoryboardIllustrations(userId, draftId);
  }

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
