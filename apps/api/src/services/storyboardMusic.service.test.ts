import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockAiJobRepo,
  mockDraftRepo,
  mockFileLinksRepo,
  mockFileRepo,
  mockMusicRepo,
  mockStoryboardRepo,
  mockSubmitGeneration,
} = vi.hoisted(() => ({
  mockAiJobRepo: { getJobById: vi.fn() },
  mockDraftRepo: { findDraftById: vi.fn() },
  mockFileLinksRepo: { linkFileToDraft: vi.fn().mockResolvedValue(undefined) },
  mockFileRepo: { findByIdForUser: vi.fn() },
  mockMusicRepo: {
    listMusicBlocksByDraftId: vi.fn(),
    releaseInactiveMusicGenerationLocks: vi.fn().mockResolvedValue(undefined),
    createMusicGenerationJobMapping: vi.fn().mockResolvedValue(true),
    setMusicGenerationJobOutput: vi.fn().mockResolvedValue(undefined),
    toMusicGenerationStatus: vi.fn((status: string) => status === 'completed' ? 'ready' : status),
    updateMusicBlock: vi.fn().mockResolvedValue(true),
    updateMusicBlockCompositionPlan: vi.fn().mockResolvedValue(undefined),
    updateMusicGenerationJobStatus: vi.fn().mockResolvedValue(undefined),
  },
  mockStoryboardRepo: {
    findBlocksByDraftId: vi.fn(),
    findEdgesByDraftId: vi.fn(),
  },
  mockSubmitGeneration: vi.fn().mockResolvedValue({ jobId: 'job-1', status: 'queued' }),
}));

vi.mock('@/repositories/aiGenerationJob.repository.js', () => mockAiJobRepo);
vi.mock('@/repositories/fileLinks.repository.js', () => mockFileLinksRepo);
vi.mock('@/repositories/file.repository.js', () => mockFileRepo);
vi.mock('@/repositories/generationDraft.repository.js', () => mockDraftRepo);
vi.mock('@/repositories/storyboard.repository.js', () => mockStoryboardRepo);
vi.mock('@/repositories/storyboardMusic.repository.js', () => mockMusicRepo);
vi.mock('@/services/aiGeneration.service.js', () => ({
  submitGeneration: mockSubmitGeneration,
}));

import type { StoryboardMusicBlock } from '@/repositories/storyboardMusic.repository.js';

import {
  generateStoryboardMusicBlock,
  listStoryboardMusic,
  updateStoryboardMusicBlock,
} from './storyboardMusic.service.js';

const USER_ID = 'user-1';
const DRAFT_ID = 'draft-1';
const SCENE_ID = 'scene-1';

const compositionPlan = {
  positive_global_styles: ['warm'],
  negative_global_styles: ['vocals'],
  sections: [
    {
      section_name: 'Main',
      positive_local_styles: ['piano'],
      negative_local_styles: [],
      duration_ms: 12_000,
      lines: [],
    },
  ],
};

function makeBlock(overrides: Partial<StoryboardMusicBlock> = {}): StoryboardMusicBlock {
  return {
    id: 'music-1',
    draftId: DRAFT_ID,
    name: 'Opening music',
    sourceMode: 'generate_now',
    prompt: 'Edited warm cinematic pulse',
    compositionPlan,
    existingFileId: null,
    startSceneBlockId: SCENE_ID,
    endSceneBlockId: SCENE_ID,
    positionX: 100,
    positionY: 620,
    sortOrder: 0,
    volume: 0.8,
    fadeInS: 0,
    fadeOutS: 1,
    loopMode: 'trim',
    generationStatus: 'failed',
    generationJobId: null,
    outputFileId: null,
    errorMessage: null,
    createdAt: new Date('2026-05-26T00:00:00Z'),
    updatedAt: new Date('2026-05-26T00:00:00Z'),
    ...overrides,
  };
}

describe('storyboardMusic.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDraftRepo.findDraftById.mockResolvedValue({
      id: DRAFT_ID,
      userId: USER_ID,
    });
    mockStoryboardRepo.findBlocksByDraftId.mockResolvedValue([
      {
        id: SCENE_ID,
        blockType: 'scene',
        durationS: 9,
        sortOrder: 1,
      },
    ]);
    mockStoryboardRepo.findEdgesByDraftId.mockResolvedValue([]);
    mockMusicRepo.listMusicBlocksByDraftId.mockResolvedValue([makeBlock()]);
    mockSubmitGeneration.mockImplementation(async (_userId, params) => {
      await params.beforeEnqueue?.('job-1');
      return { jobId: 'job-1', status: 'queued' };
    });
  });

  it('regenerates a planned music block from its edited prompt and source plan', async () => {
    await generateStoryboardMusicBlock({
      userId: USER_ID,
      draftId: DRAFT_ID,
      musicBlockId: 'music-1',
    });

    expect(mockSubmitGeneration).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({
        modelId: 'elevenlabs/music-generation',
        prompt: 'Edited warm cinematic pulse',
        options: expect.objectContaining({
          prompt: 'Edited warm cinematic pulse',
          source_composition_plan: compositionPlan,
          music_length_ms: 12_000,
          regenerate_composition_plan: true,
        }),
      }),
    );
    const options = mockSubmitGeneration.mock.calls[0]![1].options as Record<string, unknown>;
    expect(options['composition_plan']).toBeUndefined();
  });

  it('keeps composition-plan-only generation promptless when no block prompt exists', async () => {
    mockMusicRepo.listMusicBlocksByDraftId.mockResolvedValue([makeBlock({ prompt: null })]);

    await generateStoryboardMusicBlock({
      userId: USER_ID,
      draftId: DRAFT_ID,
      musicBlockId: 'music-1',
    });

    expect(mockSubmitGeneration).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({
        prompt: undefined,
        options: expect.objectContaining({ composition_plan: compositionPlan }),
      }),
    );
  });

  it('does not require a generation prompt when saving existing-track mode', async () => {
    const existingBlock = makeBlock({
      sourceMode: 'existing',
      prompt: null,
      compositionPlan: null,
      existingFileId: 'file-1',
    });
    mockFileRepo.findByIdForUser.mockResolvedValue({ id: 'file-1', kind: 'audio', status: 'ready' });
    mockMusicRepo.listMusicBlocksByDraftId.mockResolvedValue([existingBlock]);
    mockMusicRepo.updateMusicBlock.mockResolvedValue(true);

    await updateStoryboardMusicBlock({
      userId: USER_ID,
      draftId: DRAFT_ID,
      musicBlockId: 'music-1',
      patch: { sourceMode: 'existing', prompt: null, existingFileId: 'file-1' },
    });

    expect(mockSubmitGeneration).not.toHaveBeenCalled();
    expect(mockMusicRepo.updateMusicBlock).toHaveBeenCalled();
  });

  it('refreshes a regenerated composition plan from completed job options', async () => {
    const regeneratedPlan = {
      ...compositionPlan,
      positive_global_styles: ['edited'],
    };
    mockMusicRepo.listMusicBlocksByDraftId.mockResolvedValue([
      makeBlock({ generationJobId: 'job-1', outputFileId: null }),
    ]);
    mockAiJobRepo.getJobById.mockResolvedValue({
      status: 'completed',
      outputFileId: 'file-out',
      options: { composition_plan: regeneratedPlan },
      errorMessage: null,
    });

    const response = await listStoryboardMusic(USER_ID, DRAFT_ID);

    expect(mockMusicRepo.updateMusicBlockCompositionPlan).toHaveBeenCalledWith({
      id: 'music-1',
      draftId: DRAFT_ID,
      compositionPlan: regeneratedPlan,
    });
    expect(response.items[0]).toEqual(expect.objectContaining({
      compositionPlan: regeneratedPlan,
      generationStatus: 'ready',
      outputFileId: 'file-out',
    }));
  });
});
