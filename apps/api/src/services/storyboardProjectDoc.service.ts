import { randomUUID } from 'node:crypto';

import {
  projectDocSchema,
  type DraftAspectRatio,
  type ImageClip,
  type ProjectDoc,
  type PromptBlock,
  type Track,
} from '@ai-video-editor/project-schema';

import { UnprocessableEntityError } from '@/lib/errors.js';
import type { ClipInsert } from '@/repositories/clip.repository.js';
import type { GenerationDraft } from '@/repositories/generationDraft.repository.js';
import type { StoryboardBlock, StoryboardEdge } from '@/repositories/storyboard.repository.js';
import type { StoryboardSceneIllustrationJob } from '@/repositories/storyboardSceneIllustration.repository.js';
import { orderStoryboardSceneBlocks } from '@/services/storyboardGraph.service.js';

const STORYBOARD_PROJECT_FPS = 30;

const DIMENSIONS_BY_ASPECT_RATIO: Record<DraftAspectRatio, { width: number; height: number }> = {
  '16:9': { width: 1920, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1080, height: 1080 },
};

export type StoryboardProjectAssembly = {
  projectDoc: ProjectDoc;
  clipInserts: ClipInsert[];
  usedFileIds: string[];
  title: string;
};

export type BuildStoryboardProjectDocParams = {
  draft: GenerationDraft;
  blocks: StoryboardBlock[];
  edges: StoryboardEdge[];
  illustrationJobs: StoryboardSceneIllustrationJob[];
  projectId?: string;
  now?: Date;
  createId?: () => string;
};

function getDraftAspectRatio(draft: GenerationDraft): DraftAspectRatio {
  const aspectRatio = draft.promptDoc.settings?.aspectRatio;
  if (aspectRatio === '9:16' || aspectRatio === '1:1') {
    return aspectRatio;
  }
  return '16:9';
}

function deriveTitle(draft: GenerationDraft): string {
  const firstText = draft.promptDoc.blocks.find(
    (block): block is Extract<PromptBlock, { type: 'text' }> => block.type === 'text',
  );
  const title = firstText?.value.replace(/\s+/g, ' ').trim();
  return title ? title.slice(0, 80) : 'Storyboard project';
}

function latestJobsByBlock(
  jobs: StoryboardSceneIllustrationJob[],
): Map<string, StoryboardSceneIllustrationJob> {
  const byBlock = new Map<string, StoryboardSceneIllustrationJob>();
  for (const job of jobs) {
    const existing = byBlock.get(job.blockId);
    if (
      !existing ||
      job.createdAt.getTime() > existing.createdAt.getTime() ||
      (job.createdAt.getTime() === existing.createdAt.getTime() && job.id > existing.id)
    ) {
      byBlock.set(job.blockId, job);
    }
  }
  return byBlock;
}

function getReadyOutputFileId(
  block: StoryboardBlock,
  jobsByBlock: Map<string, StoryboardSceneIllustrationJob>,
): string {
  const job = jobsByBlock.get(block.id);
  if (!job || job.status !== 'ready' || !job.outputFileId) {
    throw new UnprocessableEntityError(`Scene ${block.name ?? block.id} is missing a ready generated image`);
  }
  return job.outputFileId;
}

function durationToFrames(block: StoryboardBlock): number {
  if (!Number.isFinite(block.durationS) || block.durationS <= 0) {
    throw new UnprocessableEntityError(`Scene ${block.name ?? block.id} must have a positive duration`);
  }
  return Math.max(1, Math.round(block.durationS * STORYBOARD_PROJECT_FPS));
}

export function buildStoryboardProjectDoc(
  params: BuildStoryboardProjectDocParams,
): StoryboardProjectAssembly {
  const createId = params.createId ?? randomUUID;
  const sceneBlocks = orderStoryboardSceneBlocks(params.blocks, params.edges);
  if (sceneBlocks.length === 0) {
    throw new UnprocessableEntityError('Storyboard has no scene blocks to assemble');
  }

  const projectId = params.projectId ?? createId();
  const trackId = createId();
  const title = deriveTitle(params.draft);
  const aspectRatio = getDraftAspectRatio(params.draft);
  const dimensions = DIMENSIONS_BY_ASPECT_RATIO[aspectRatio];
  const jobsByBlock = latestJobsByBlock(params.illustrationJobs);
  const createdAt = (params.now ?? new Date()).toISOString();

  let startFrame = 0;
  const clips: ImageClip[] = [];
  const clipInserts: ClipInsert[] = [];
  const usedFileIds: string[] = [];

  for (const block of sceneBlocks) {
    const fileId = getReadyOutputFileId(block, jobsByBlock);
    const durationFrames = durationToFrames(block);
    const clipId = createId();
    const clip: ImageClip = {
      id: clipId,
      type: 'image',
      fileId,
      trackId,
      startFrame,
      durationFrames,
      opacity: 1,
    };
    clips.push(clip);
    clipInserts.push({
      clipId,
      projectId,
      trackId,
      type: 'image',
      fileId,
      startFrame,
      durationFrames,
      layer: 0,
    });
    usedFileIds.push(fileId);
    startFrame += durationFrames;
  }

  const track: Track = {
    id: trackId,
    type: 'video',
    name: 'Storyboard images',
    muted: false,
    locked: false,
  };

  const projectDoc: ProjectDoc = projectDocSchema.parse({
    schemaVersion: 1,
    id: projectId,
    title,
    fps: STORYBOARD_PROJECT_FPS,
    durationFrames: startFrame,
    width: dimensions.width,
    height: dimensions.height,
    tracks: [track],
    clips,
    createdAt,
    updatedAt: createdAt,
  });

  return {
    projectDoc,
    clipInserts,
    usedFileIds: [...new Set(usedFileIds)],
    title,
  };
}

