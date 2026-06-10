import { ReferenceNotReadyError, UnlinkedScenesError } from '@/lib/errors.js';
import * as storyboardRepository from '@/repositories/storyboard.repository.js';
import * as storyboardPlanJobRepository from '@/repositories/storyboardPlanJob.repository.js';
import * as referenceBlocksRepository from '@/repositories/storyboardReference.repository.js';
import {
  createIllustrationJob,
} from '@/services/storyboardIllustration.jobs.js';
import {
  publishStoryboardIllustrationStatus,
} from '@/services/storyboardIllustration.realtime.js';
import {
  getLatestMappings,
  getNextSceneToCreate,
  getPreviousSceneOutputFileId,
  isActiveIllustrationStatus,
  toStatusResponse,
} from '@/services/storyboardIllustration.status.js';
import type { StoryboardIllustrationStatusResponse } from '@/services/storyboardIllustration.types.js';
import {
  assertPromptedBlocks,
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
  StoryboardAutomationPhase, StoryboardAutomationStatus,
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
