import { randomUUID } from 'node:crypto';

import {
  projectDocSchema,
  type Clip,
  type DraftAspectRatio,
  type ImageClip,
  type ProjectDoc,
  type PromptBlock,
  type Track,
  type VideoClip,
} from '@ai-video-editor/project-schema';

import { UnprocessableEntityError } from '@/lib/errors.js';
import type { ClipInsert } from '@/repositories/clip.repository.js';
import type { GenerationDraft } from '@/repositories/generationDraft.repository.js';
import type { StoryboardBlock, StoryboardEdge } from '@/repositories/storyboard.repository.js';
import type { StoryboardMusicBlock } from '@/repositories/storyboardMusic.repository.js';
import type { StoryboardSceneIllustrationJob } from '@/repositories/storyboardSceneIllustration.repository.js';
import type { StoryboardSceneVideoJob } from '@/repositories/storyboardSceneVideo.repository.js';
import { orderStoryboardSceneBlocks } from '@/services/storyboardGraph.service.js';
import { appendStoryboardMusicClips } from '@/services/storyboardProjectMusicAssembly.service.js';

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
  mode?: 'images' | 'videos';
  illustrationJobs?: StoryboardSceneIllustrationJob[];
  videoJobs?: StoryboardSceneVideoJob[];
  musicBlocks?: StoryboardMusicBlock[];
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

function latestVideoJobsByBlock(
  jobs: StoryboardSceneVideoJob[],
): Map<string, StoryboardSceneVideoJob> {
  const byBlock = new Map<string, StoryboardSceneVideoJob>();
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

function getReadyVideoOutputFileId(
  block: StoryboardBlock,
  jobsByBlock: Map<string, StoryboardSceneVideoJob>,
): string {
  const job = jobsByBlock.get(block.id);
  if (!job || job.status !== 'ready' || !job.outputFileId) {
    throw new UnprocessableEntityError(`Scene ${block.name ?? block.id} is missing a ready generated video`);
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
  const mode = params.mode ?? 'images';
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
  const imageJobsByBlock = latestJobsByBlock(params.illustrationJobs ?? []);
  const videoJobsByBlock = latestVideoJobsByBlock(params.videoJobs ?? []);
  const createdAt = (params.now ?? new Date()).toISOString();

  let startFrame = 0;
  const clips: Clip[] = [];
  const clipInserts: ClipInsert[] = [];
  const usedFileIds: string[] = [];
  const sceneFrameRanges = new Map<string, { startFrame: number; durationFrames: number }>();

  for (const block of sceneBlocks) {
    const fileId = mode === 'videos'
      ? getReadyVideoOutputFileId(block, videoJobsByBlock)
      : getReadyOutputFileId(block, imageJobsByBlock);
    const durationFrames = durationToFrames(block);
    const clipId = createId();
    const clip: ImageClip | VideoClip = mode === 'videos'
      ? {
          id: clipId,
          type: 'video',
          fileId,
          trackId,
          startFrame,
          durationFrames,
          trimInFrame: 0,
          opacity: 1,
          volume: 1,
        }
      : {
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
      type: mode === 'videos' ? 'video' : 'image',
      fileId,
      startFrame,
      durationFrames,
      layer: 0,
    });
    usedFileIds.push(fileId);
    sceneFrameRanges.set(block.id, { startFrame, durationFrames });
    startFrame += durationFrames;
  }

  const tracks: Track[] = [{
    id: trackId,
    type: 'video',
    name: mode === 'videos' ? 'Storyboard videos' : 'Storyboard images',
    muted: false,
    locked: false,
  }];

  appendStoryboardMusicClips({
    musicBlocks: params.musicBlocks ?? [],
    sceneFrameRanges,
    sceneOrder: sceneBlocks.map((block) => block.id),
    projectId,
    tracks,
    clips,
    clipInserts,
    usedFileIds,
    createId,
  });

  const projectDoc: ProjectDoc = projectDocSchema.parse({
    schemaVersion: 1,
    id: projectId,
    title,
    fps: STORYBOARD_PROJECT_FPS,
    durationFrames: startFrame,
    width: dimensions.width,
    height: dimensions.height,
    tracks,
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
