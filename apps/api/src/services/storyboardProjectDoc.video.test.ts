import { describe, expect, it } from 'vitest';

import { projectDocSchema, type PromptDoc } from '@ai-video-editor/project-schema';
import { UnprocessableEntityError } from '@/lib/errors.js';
import type { GenerationDraft } from '@/repositories/generationDraft.repository.js';
import type { StoryboardBlock } from '@/repositories/storyboard.repository.js';
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
    id: '00000000-0000-4000-8000-000000000010',
    draftId: DRAFT_ID,
    blockType: 'scene',
    name: 'Scene',
    prompt: 'Scene prompt',
    durationS: 5,
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

function makeVideoJob(overrides: Partial<StoryboardSceneVideoJob>): StoryboardSceneVideoJob {
  return {
    id: '00000000-0000-4000-8000-000000000050',
    draftId: DRAFT_ID,
    blockId: '00000000-0000-4000-8000-000000000010',
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

function makeIdFactory(): () => string {
  const ids = [
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000102',
    '00000000-0000-4000-8000-000000000103',
    '00000000-0000-4000-8000-000000000104',
  ];
  return () => ids.shift() ?? '00000000-0000-4000-8000-000000000199';
}

describe('buildStoryboardProjectDoc video mode', () => {
  it('builds valid video clips from ready generated scene video outputs', () => {
    const sceneA = makeBlock({
      id: '00000000-0000-4000-8000-000000000011',
      durationS: 2.4,
      sortOrder: 1,
    });
    const sceneB = makeBlock({
      id: '00000000-0000-4000-8000-000000000012',
      durationS: 1.6,
      sortOrder: 2,
    });
    const fileA = '00000000-0000-4000-8000-000000000071';
    const fileB = '00000000-0000-4000-8000-000000000072';

    const result = buildStoryboardProjectDoc({
      draft: makeDraft(basePromptDoc()),
      blocks: [sceneA, sceneB],
      edges: [],
      mode: 'videos',
      videoJobs: [
        makeVideoJob({ blockId: sceneA.id, outputFileId: fileA }),
        makeVideoJob({ blockId: sceneB.id, outputFileId: fileB }),
      ],
      projectId: PROJECT_ID,
      now: NOW,
      createId: makeIdFactory(),
    });

    expect(projectDocSchema.safeParse(result.projectDoc).success).toBe(true);
    expect(result.projectDoc.tracks[0]).toMatchObject({ type: 'video', name: 'Storyboard videos' });
    expect(result.projectDoc.clips).toEqual([
      expect.objectContaining({ type: 'video', fileId: fileA, startFrame: 0, durationFrames: 72 }),
      expect.objectContaining({ type: 'video', fileId: fileB, startFrame: 72, durationFrames: 48 }),
    ]);
    expect(result.usedFileIds).toEqual([fileA, fileB]);
  });

  it('rejects missing ready scene video outputs in video mode', () => {
    expect(() => buildStoryboardProjectDoc({
      draft: makeDraft(basePromptDoc()),
      blocks: [makeBlock({})],
      edges: [],
      mode: 'videos',
      videoJobs: [makeVideoJob({ status: 'running', outputFileId: null })],
      projectId: PROJECT_ID,
      now: NOW,
      createId: makeIdFactory(),
    })).toThrow(UnprocessableEntityError);
  });
});
