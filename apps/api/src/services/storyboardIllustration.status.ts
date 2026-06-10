import { randomUUID } from 'node:crypto';

import * as aiGenerationJobRepository from '@/repositories/aiGenerationJob.repository.js';
import type { StoryboardBlock } from '@/repositories/storyboard.repository.js';
import type { StoryboardPlanJob } from '@/repositories/storyboardPlanJob.repository.js';
import * as illustrationRepository from '@/repositories/storyboardSceneIllustration.repository.js';
import type {
  StoryboardSceneIllustrationJob,
  StoryboardSceneIllustrationStatus,
} from '@/repositories/storyboardSceneIllustration.repository.js';
import type {
  StoryboardAutomationPhase,
  StoryboardIllustrationStatusItem,
  StoryboardIllustrationStatusResponse,
} from '@/services/storyboardIllustration.types.js';

export function isActiveIllustrationStatus(
  status: StoryboardSceneIllustrationStatus | undefined,
): boolean {
  return status === 'queued' || status === 'running' || status === 'ready';
}

async function refreshMapping(
  mapping: StoryboardSceneIllustrationJob,
): Promise<StoryboardSceneIllustrationJob> {
  if (mapping.outputFileId && mapping.status !== 'ready') {
    await illustrationRepository.setIllustrationJobOutput({
      aiJobId: mapping.aiJobId,
      outputFileId: mapping.outputFileId,
    });
    return { ...mapping, status: 'ready', errorMessage: null };
  }

  const aiJob = await aiGenerationJobRepository.getJobById(mapping.aiJobId);
  if (!aiJob) return mapping;

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

export async function getLatestMappings(
  draftId: string,
): Promise<Map<string, StoryboardSceneIllustrationJob>> {
  const mappings = await illustrationRepository.findLatestIllustrationJobsByDraftId(draftId);
  const refreshed = await Promise.all(mappings.map(refreshMapping));
  return new Map(refreshed.map((mapping) => [mapping.blockId, mapping]));
}

export function toStatusResponse(
  sceneBlocks: StoryboardBlock[],
  mappingsByBlock: Map<string, StoryboardSceneIllustrationJob>,
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
      phase: getAutomationPhase({ sceneBlocks, items, latestPlanJob }),
      planningJobId:
        latestPlanJob && ['queued', 'running', 'completed', 'failed'].includes(latestPlanJob.status)
          ? latestPlanJob.jobId
          : null,
      errorMessage: getAutomationErrorMessage({ items, latestPlanJob }),
    },
    items,
  };
}

function getAutomationPhase(params: {
  sceneBlocks: StoryboardBlock[];
  items: StoryboardIllustrationStatusItem[];
  latestPlanJob: StoryboardPlanJob | null;
}): StoryboardAutomationPhase {
  if (params.latestPlanJob?.status === 'queued' || params.latestPlanJob?.status === 'running') {
    return 'planning';
  }
  if (params.latestPlanJob?.status === 'failed' && params.sceneBlocks.length === 0) {
    return 'failed';
  }
  if (params.items.some((item) => item.status === 'failed')) {
    return 'failed';
  }
  if (params.items.some((item) => item.jobId && (item.status === 'queued' || item.status === 'running'))) {
    return 'generating_scene_illustrations';
  }
  if (
    params.sceneBlocks.length > 0 &&
    params.items.every((item) => item.status === 'ready')
  ) {
    return 'ready';
  }
  return 'idle';
}

function getAutomationErrorMessage(params: {
  items: StoryboardIllustrationStatusItem[];
  latestPlanJob: StoryboardPlanJob | null;
}): string | null {
  if (params.latestPlanJob?.status === 'failed') {
    return params.latestPlanJob.errorMessage ?? 'Storyboard planning failed';
  }
  const failedScene = params.items.find((item) => item.status === 'failed');
  return failedScene?.errorMessage ?? null;
}

function getReadyOutputFileId(
  mapping: StoryboardSceneIllustrationJob | undefined,
): string | null {
  if (mapping?.status !== 'ready' || !mapping.outputFileId) return null;
  return mapping.outputFileId;
}

export function getNextSceneToCreate(params: {
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
    if (isActiveIllustrationStatus(latest?.status)) return null;
    return { block, previousSceneFileId };
  }

  return null;
}

export function getPreviousSceneOutputFileId(params: {
  sceneBlocks: StoryboardBlock[];
  blockId: string;
  mappingsByBlock: Map<string, StoryboardSceneIllustrationJob>;
}): string | undefined | null {
  const index = params.sceneBlocks.findIndex((block) => block.id === params.blockId);
  if (index <= 0) return undefined;

  const previous = params.sceneBlocks[index - 1]!;
  return getReadyOutputFileId(params.mappingsByBlock.get(previous.id));
}
