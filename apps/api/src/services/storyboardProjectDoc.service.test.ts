import { describe, expect, it } from 'vitest';

import { projectDocSchema, type PromptDoc } from '@ai-video-editor/project-schema';
import { UnprocessableEntityError } from '@/lib/errors.js';
import type { GenerationDraft } from '@/repositories/generationDraft.repository.js';
import type { StoryboardBlock, StoryboardEdge } from '@/repositories/storyboard.repository.js';
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

function edge(sourceBlockId: string, targetBlockId: string): StoryboardEdge {
  return {
    id: `${sourceBlockId}-${targetBlockId}`,
    draftId: DRAFT_ID,
    sourceBlockId,
    targetBlockId,
  };
}

function makeJob(overrides: Partial<StoryboardSceneIllustrationJob>): StoryboardSceneIllustrationJob {
  return {
    id: '00000000-0000-4000-8000-000000000020',
    draftId: DRAFT_ID,
    blockId: '00000000-0000-4000-8000-000000000010',
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

function basePromptDoc(overrides: Partial<PromptDoc> = {}): PromptDoc {
  return {
    schemaVersion: 1,
    blocks: [{ type: 'text', value: 'A concise launch video for a new product.' }],
    settings: {
      videoLengthSeconds: 30,
      aspectRatio: '16:9',
      styleKey: 'cinematic',
      modelPreference: null,
    },
    ...overrides,
  };
}

describe('buildStoryboardProjectDoc', () => {
  it('builds a valid ProjectDoc and clip insert rows from ready generated scene outputs', () => {
    const sceneA = makeBlock({
      id: '00000000-0000-4000-8000-000000000011',
      durationS: 2.4,
      sortOrder: 2,
    });
    const sceneB = makeBlock({
      id: '00000000-0000-4000-8000-000000000012',
      durationS: 1.6,
      sortOrder: 1,
    });
    const start = makeBlock({ id: 'start', blockType: 'start', sortOrder: 0, durationS: 0 });
    const end = makeBlock({ id: 'end', blockType: 'end', sortOrder: 3, durationS: 0 });
    const fileA = '00000000-0000-4000-8000-000000000041';
    const fileB = '00000000-0000-4000-8000-000000000042';

    const result = buildStoryboardProjectDoc({
      draft: makeDraft(basePromptDoc()),
      blocks: [start, sceneA, sceneB, end],
      edges: [edge('start', sceneA.id), edge(sceneA.id, sceneB.id), edge(sceneB.id, 'end')],
      illustrationJobs: [
        makeJob({ blockId: sceneA.id, outputFileId: fileA }),
        makeJob({ blockId: sceneB.id, outputFileId: fileB }),
      ],
      projectId: PROJECT_ID,
      now: NOW,
      createId: makeIdFactory(),
    });

    expect(projectDocSchema.safeParse(result.projectDoc).success).toBe(true);
    expect(result.projectDoc).toMatchObject({
      id: PROJECT_ID,
      title: 'A concise launch video for a new product.',
      fps: 30,
      width: 1920,
      height: 1080,
      durationFrames: 120,
    });
    expect(result.projectDoc.clips.map((clip) => clip.fileId)).toEqual([fileA, fileB]);
    expect(result.projectDoc.clips.map((clip) => clip.startFrame)).toEqual([0, 72]);
    expect(result.projectDoc.clips.map((clip) => clip.durationFrames)).toEqual([72, 48]);
    expect(result.clipInserts).toEqual([
      expect.objectContaining({
        projectId: PROJECT_ID,
        type: 'image',
        fileId: fileA,
        startFrame: 0,
        durationFrames: 72,
      }),
      expect.objectContaining({
        projectId: PROJECT_ID,
        type: 'image',
        fileId: fileB,
        startFrame: 72,
        durationFrames: 48,
      }),
    ]);
    expect(result.usedFileIds).toEqual([fileA, fileB]);
  });

  it('falls back to sortOrder when the graph is invalid', () => {
    const sceneA = makeBlock({ id: '00000000-0000-4000-8000-000000000011', sortOrder: 2 });
    const sceneB = makeBlock({ id: '00000000-0000-4000-8000-000000000012', sortOrder: 1 });
    const start = makeBlock({ id: 'start', blockType: 'start', sortOrder: 0, durationS: 0 });
    const fileA = '00000000-0000-4000-8000-000000000041';
    const fileB = '00000000-0000-4000-8000-000000000042';

    const result = buildStoryboardProjectDoc({
      draft: makeDraft(basePromptDoc()),
      blocks: [start, sceneA, sceneB],
      edges: [edge('start', sceneA.id)],
      illustrationJobs: [
        makeJob({ blockId: sceneA.id, outputFileId: fileA }),
        makeJob({ blockId: sceneB.id, outputFileId: fileB }),
      ],
      projectId: PROJECT_ID,
      now: NOW,
      createId: makeIdFactory(),
    });

    expect(result.projectDoc.clips.map((clip) => clip.fileId)).toEqual([fileB, fileA]);
  });

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
    expect(result.projectDoc.tracks[0]).toMatchObject({
      type: 'video',
      name: 'Storyboard videos',
    });
    expect(result.projectDoc.clips).toEqual([
      expect.objectContaining({
        type: 'video',
        fileId: fileA,
        startFrame: 0,
        durationFrames: 72,
        trimInFrame: 0,
        volume: 1,
      }),
      expect.objectContaining({
        type: 'video',
        fileId: fileB,
        startFrame: 72,
        durationFrames: 48,
        trimInFrame: 0,
        volume: 1,
      }),
    ]);
    expect(result.clipInserts).toEqual([
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

  it.each([
    ['16:9', 1920, 1080],
    ['9:16', 1080, 1920],
    ['1:1', 1080, 1080],
  ] as const)('maps %s aspect ratio to project dimensions', (aspectRatio, width, height) => {
    const result = buildStoryboardProjectDoc({
      draft: makeDraft(basePromptDoc({
        settings: {
          videoLengthSeconds: 30,
          aspectRatio,
          styleKey: 'cinematic',
          modelPreference: null,
        },
      })),
      blocks: [makeBlock({ durationS: 1 })],
      edges: [],
      illustrationJobs: [makeJob({})],
      projectId: PROJECT_ID,
      now: NOW,
      createId: makeIdFactory(),
    });

    expect(result.projectDoc.width).toBe(width);
    expect(result.projectDoc.height).toBe(height);
  });

  it('rejects missing ready scene outputs', () => {
    expect(() => buildStoryboardProjectDoc({
      draft: makeDraft(basePromptDoc()),
      blocks: [makeBlock({})],
      edges: [],
      illustrationJobs: [makeJob({ status: 'running', outputFileId: null })],
      projectId: PROJECT_ID,
      now: NOW,
      createId: makeIdFactory(),
    })).toThrow(UnprocessableEntityError);
  });

  it('rejects empty scene lists', () => {
    expect(() => buildStoryboardProjectDoc({
      draft: makeDraft(basePromptDoc()),
      blocks: [],
      edges: [],
      illustrationJobs: [],
      projectId: PROJECT_ID,
      now: NOW,
      createId: makeIdFactory(),
    })).toThrow(UnprocessableEntityError);
  });

  it('falls back to a default title when the draft has no text prompt', () => {
    const result = buildStoryboardProjectDoc({
      draft: makeDraft(basePromptDoc({ blocks: [] })),
      blocks: [makeBlock({})],
      edges: [],
      illustrationJobs: [makeJob({})],
      projectId: PROJECT_ID,
      now: NOW,
      createId: makeIdFactory(),
    });

    expect(result.title).toBe('Storyboard project');
    expect(result.projectDoc.title).toBe('Storyboard project');
  });
});
