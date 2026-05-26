import { describe, expect, it } from 'vitest';

import { projectDocSchema, type PromptDoc } from '@ai-video-editor/project-schema';
import { UnprocessableEntityError } from '@/lib/errors.js';
import type { GenerationDraft } from '@/repositories/generationDraft.repository.js';
import type { StoryboardBlock } from '@/repositories/storyboard.repository.js';
import type { StoryboardMusicBlock } from '@/repositories/storyboardMusic.repository.js';
import type { StoryboardSceneIllustrationJob } from '@/repositories/storyboardSceneIllustration.repository.js';
import type { StoryboardSceneVideoJob } from '@/repositories/storyboardSceneVideo.repository.js';
import { buildStoryboardProjectDoc } from './storyboardProjectDoc.service.js';

const USER_ID = '00000000-0000-4000-8000-000000000001';
const DRAFT_ID = '00000000-0000-4000-8000-000000000002';
const PROJECT_ID = '00000000-0000-4000-8000-000000000003';
const NOW = new Date('2026-05-22T10:00:00.000Z');

function makeDraft(promptDoc: PromptDoc): GenerationDraft {
  return {
    id: DRAFT_ID,
    userId: USER_ID,
    promptDoc,
    status: 'step2',
    createdProjectId: null,
    createdProjectVersionId: null,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
  };
}

function basePromptDoc(): PromptDoc {
  return {
    schemaVersion: 1,
    blocks: [{ type: 'text', value: 'A concise launch video.' }],
    settings: {
      videoLengthSeconds: 30,
      aspectRatio: '16:9',
      styleKey: 'cinematic',
      modelPreference: null,
    },
  };
}

function makeBlock(overrides: Partial<StoryboardBlock>): StoryboardBlock {
  return {
    id: '00000000-0000-4000-8000-000000000011',
    draftId: DRAFT_ID,
    blockType: 'scene',
    name: 'Scene',
    prompt: 'Scene prompt',
    durationS: 2,
    positionX: 0,
    positionY: 0,
    sortOrder: 1,
    style: null,
    createdAt: NOW,
    updatedAt: NOW,
    mediaItems: [],
    ...overrides,
  };
}

function makeJob(overrides: Partial<StoryboardSceneIllustrationJob>): StoryboardSceneIllustrationJob {
  return {
    id: '00000000-0000-4000-8000-000000000020',
    draftId: DRAFT_ID,
    blockId: '00000000-0000-4000-8000-000000000011',
    aiJobId: '00000000-0000-4000-8000-000000000030',
    status: 'ready',
    outputFileId: '00000000-0000-4000-8000-000000000040',
    errorMessage: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeVideoJob(overrides: Partial<StoryboardSceneVideoJob>): StoryboardSceneVideoJob {
  return {
    id: '00000000-0000-4000-8000-000000000050',
    draftId: DRAFT_ID,
    blockId: '00000000-0000-4000-8000-000000000011',
    aiJobId: '00000000-0000-4000-8000-000000000060',
    modelId: 'fal-ai/ltx-2-19b/image-to-video',
    generateAudio: true,
    status: 'ready',
    outputFileId: '00000000-0000-4000-8000-000000000070',
    errorMessage: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeMusicBlock(overrides: Partial<StoryboardMusicBlock> = {}): StoryboardMusicBlock {
  return {
    id: '00000000-0000-4000-8000-000000000080',
    draftId: DRAFT_ID,
    name: 'Main music',
    sourceMode: 'generate_on_step3',
    prompt: 'Warm instrumental music',
    compositionPlan: null,
    existingFileId: null,
    startSceneBlockId: '00000000-0000-4000-8000-000000000011',
    endSceneBlockId: '00000000-0000-4000-8000-000000000012',
    positionX: 0,
    positionY: 0,
    sortOrder: 1,
    volume: 0.6,
    fadeInS: 0,
    fadeOutS: 0,
    loopMode: 'trim',
    generationStatus: 'ready',
    generationJobId: '00000000-0000-4000-8000-000000000081',
    outputFileId: '00000000-0000-4000-8000-000000000082',
    errorMessage: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeIdFactory(): () => string {
  const ids = [
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000102',
    '00000000-0000-4000-8000-000000000103',
    '00000000-0000-4000-8000-000000000104',
    '00000000-0000-4000-8000-000000000105',
    '00000000-0000-4000-8000-000000000106',
  ];
  return () => ids.shift() ?? '00000000-0000-4000-8000-000000000199';
}

describe('buildStoryboardProjectDoc music assembly', () => {
  it('adds resolved storyboard music as background audio clips in image mode', () => {
    const sceneA = makeBlock({ id: '00000000-0000-4000-8000-000000000011', durationS: 2 });
    const sceneB = makeBlock({ id: '00000000-0000-4000-8000-000000000012', durationS: 3, sortOrder: 2 });
    const imageA = '00000000-0000-4000-8000-000000000041';
    const imageB = '00000000-0000-4000-8000-000000000042';
    const musicFile = '00000000-0000-4000-8000-000000000083';

    const result = buildStoryboardProjectDoc({
      draft: makeDraft(basePromptDoc()),
      blocks: [sceneA, sceneB],
      edges: [],
      illustrationJobs: [
        makeJob({ blockId: sceneA.id, outputFileId: imageA }),
        makeJob({ blockId: sceneB.id, outputFileId: imageB }),
      ],
      musicBlocks: [makeMusicBlock({ outputFileId: musicFile })],
      projectId: PROJECT_ID,
      now: NOW,
      createId: makeIdFactory(),
    });

    expect(projectDocSchema.safeParse(result.projectDoc).success).toBe(true);
    expect(result.projectDoc.tracks).toEqual([
      expect.objectContaining({ type: 'video', name: 'Storyboard images' }),
      expect.objectContaining({ type: 'audio', name: 'Storyboard music' }),
    ]);
    expect(result.projectDoc.clips).toEqual([
      expect.objectContaining({ type: 'image', fileId: imageA, startFrame: 0, durationFrames: 60 }),
      expect.objectContaining({ type: 'image', fileId: imageB, startFrame: 60, durationFrames: 90 }),
      expect.objectContaining({ type: 'audio', fileId: musicFile, startFrame: 0, durationFrames: 150 }),
    ]);
    expect(result.usedFileIds).toEqual([imageA, imageB, musicFile]);
  });

  it('adds resolved storyboard music as background audio clips in video mode', () => {
    const sceneA = makeBlock({ id: '00000000-0000-4000-8000-000000000011', durationS: 2 });
    const sceneB = makeBlock({ id: '00000000-0000-4000-8000-000000000012', durationS: 3, sortOrder: 2 });
    const videoA = '00000000-0000-4000-8000-000000000071';
    const videoB = '00000000-0000-4000-8000-000000000072';
    const musicFile = '00000000-0000-4000-8000-000000000084';

    const result = buildStoryboardProjectDoc({
      draft: makeDraft(basePromptDoc()),
      blocks: [sceneA, sceneB],
      edges: [],
      mode: 'videos',
      videoJobs: [
        makeVideoJob({ blockId: sceneA.id, outputFileId: videoA }),
        makeVideoJob({ blockId: sceneB.id, outputFileId: videoB }),
      ],
      musicBlocks: [makeMusicBlock({
        sourceMode: 'existing',
        existingFileId: musicFile,
        outputFileId: null,
        generationStatus: null,
      })],
      projectId: PROJECT_ID,
      now: NOW,
      createId: makeIdFactory(),
    });

    expect(result.projectDoc.clips).toEqual([
      expect.objectContaining({ type: 'video', fileId: videoA, startFrame: 0, durationFrames: 60 }),
      expect.objectContaining({ type: 'video', fileId: videoB, startFrame: 60, durationFrames: 90 }),
      expect.objectContaining({ type: 'audio', fileId: musicFile, startFrame: 0, durationFrames: 150 }),
    ]);
    expect(result.usedFileIds).toEqual([videoA, videoB, musicFile]);
  });

  it('rejects unresolved generated music and invalid logical ranges', () => {
    expect(() => buildStoryboardProjectDoc({
      draft: makeDraft(basePromptDoc()),
      blocks: [makeBlock({})],
      edges: [],
      illustrationJobs: [makeJob({})],
      musicBlocks: [makeMusicBlock({ generationStatus: 'running', outputFileId: null })],
      projectId: PROJECT_ID,
      now: NOW,
      createId: makeIdFactory(),
    })).toThrow(UnprocessableEntityError);

    const sceneA = makeBlock({ id: '00000000-0000-4000-8000-000000000011', sortOrder: 1 });
    const sceneB = makeBlock({ id: '00000000-0000-4000-8000-000000000012', sortOrder: 2 });

    expect(() => buildStoryboardProjectDoc({
      draft: makeDraft(basePromptDoc()),
      blocks: [sceneA, sceneB],
      edges: [],
      illustrationJobs: [
        makeJob({ blockId: sceneA.id, outputFileId: '00000000-0000-4000-8000-000000000041' }),
        makeJob({ blockId: sceneB.id, outputFileId: '00000000-0000-4000-8000-000000000042' }),
      ],
      musicBlocks: [makeMusicBlock({ startSceneBlockId: sceneB.id, endSceneBlockId: sceneA.id })],
      projectId: PROJECT_ID,
      now: NOW,
      createId: makeIdFactory(),
    })).toThrow(UnprocessableEntityError);
  });
});
