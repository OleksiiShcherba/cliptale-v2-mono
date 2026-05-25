import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AI_MODELS } from '@ai-video-editor/api-contracts';

const {
  mockAiGenerationService,
  mockAiJobRepo,
  mockDraftRepo,
  mockStoryboardRepo,
  mockIllustrationRepo,
  mockReferenceRepo,
  mockVideoRepo,
} = vi.hoisted(() => ({
  mockAiGenerationService: { submitGeneration: vi.fn() },
  mockAiJobRepo: { getJobById: vi.fn() },
  mockDraftRepo: { findDraftById: vi.fn() },
  mockStoryboardRepo: { findBlocksByDraftId: vi.fn(), findEdgesByDraftId: vi.fn() },
  mockIllustrationRepo: { findLatestIllustrationJobsByDraftId: vi.fn() },
  mockReferenceRepo: { findLatestReferenceByDraftId: vi.fn() },
  mockVideoRepo: {
    createVideoJobMapping: vi.fn(),
    findLatestVideoJobsByDraftId: vi.fn(),
    setVideoJobOutput: vi.fn(),
    toSceneVideoStatus: vi.fn((status: string) => {
      if (status === 'processing') return 'running';
      if (status === 'completed') return 'ready';
      return status;
    }),
    updateVideoJobStatus: vi.fn(),
  },
}));

vi.mock('@/services/aiGeneration.service.js', () => mockAiGenerationService);
vi.mock('@/repositories/aiGenerationJob.repository.js', () => mockAiJobRepo);
vi.mock('@/repositories/generationDraft.repository.js', () => mockDraftRepo);
vi.mock('@/repositories/storyboard.repository.js', () => mockStoryboardRepo);
vi.mock('@/repositories/storyboardSceneIllustration.repository.js', () => mockIllustrationRepo);
vi.mock('@/repositories/storyboardIllustrationReference.repository.js', () => mockReferenceRepo);
vi.mock('@/repositories/storyboardSceneVideo.repository.js', () => mockVideoRepo);

import { ValidationError, UnprocessableEntityError } from '@/lib/errors.js';
import type { StoryboardBlock, StoryboardEdge } from '@/repositories/storyboard.repository.js';
import {
  buildStoryboardVideoOptions,
  modelSupportsAudio,
  startStoryboardVideos,
  listStoryboardVideos,
} from './storyboardVideo.service.js';

const USER_ID = 'user-1';
const DRAFT_ID = 'draft-1';
const LTX_MODEL_ID = 'fal-ai/ltx-2-19b/image-to-video';
const PIXVERSE_MODEL_ID = 'fal-ai/pixverse/v6/image-to-video';
const WAN_MODEL_ID = 'fal-ai/wan/v2.2-a14b/image-to-video';

function getModel(id: string) {
  return AI_MODELS.find((model) => model.id === id)!;
}

function makeDraft(overrides: Record<string, unknown> = {}) {
  return {
    id: DRAFT_ID,
    userId: USER_ID,
    promptDoc: { schemaVersion: 1, blocks: [] },
    status: 'step2',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

function makeBlock(overrides: Partial<StoryboardBlock> = {}): StoryboardBlock {
  return {
    id: 'block-1',
    draftId: DRAFT_ID,
    blockType: 'scene',
    name: 'Scene 01',
    prompt: 'A still image prompt.',
    videoPrompt: 'Push in while the subject turns toward camera.',
    durationS: 6,
    positionX: 0,
    positionY: 0,
    sortOrder: 1,
    style: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    mediaItems: [],
    ...overrides,
  };
}

function makeEdge(sourceBlockId: string, targetBlockId: string): StoryboardEdge {
  return {
    id: `${sourceBlockId}-${targetBlockId}`,
    draftId: DRAFT_ID,
    sourceBlockId,
    targetBlockId,
  };
}

function makeIllustration(blockId: string, outputFileId: string) {
  return {
    id: `illustration-${blockId}`,
    draftId: DRAFT_ID,
    blockId,
    aiJobId: `image-job-${blockId}`,
    status: 'ready',
    outputFileId,
    errorMessage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeVideoMapping(overrides: Record<string, unknown> = {}) {
  return {
    id: 'video-map-1',
    draftId: DRAFT_ID,
    blockId: 'block-1',
    aiJobId: 'video-job-1',
    modelId: LTX_MODEL_ID,
    generateAudio: false,
    status: 'queued',
    outputFileId: null,
    errorMessage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeReference(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ref-1',
    draftId: DRAFT_ID,
    aiJobId: 'ref-job-1',
    status: 'ready',
    outputFileId: 'ref-file-1',
    sourceReferenceFileIds: [],
    approvalStatus: 'approved',
    approvedAt: new Date(),
    errorMessage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('storyboardVideo.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDraftRepo.findDraftById.mockResolvedValue(makeDraft());
    mockStoryboardRepo.findBlocksByDraftId.mockResolvedValue([makeBlock()]);
    mockStoryboardRepo.findEdgesByDraftId.mockResolvedValue([]);
    mockIllustrationRepo.findLatestIllustrationJobsByDraftId.mockResolvedValue([
      makeIllustration('block-1', 'image-file-1'),
    ]);
    mockReferenceRepo.findLatestReferenceByDraftId.mockResolvedValue(makeReference());
    mockVideoRepo.createVideoJobMapping.mockResolvedValue(true);
    mockVideoRepo.findLatestVideoJobsByDraftId.mockResolvedValue([]);
    mockVideoRepo.setVideoJobOutput.mockResolvedValue(undefined);
    mockVideoRepo.updateVideoJobStatus.mockResolvedValue(undefined);
    mockAiJobRepo.getJobById.mockResolvedValue(null);
    mockAiGenerationService.submitGeneration.mockImplementation(
      async (_userId: string, params: { beforeEnqueue?: (jobId: string) => Promise<void> }) => {
        await params.beforeEnqueue?.('video-job-new');
        return { jobId: 'video-job-new', status: 'queued' };
      },
    );
  });

  it('builds model options with prompt, start/end images, audio, and enum duration', () => {
    const model = getModel(LTX_MODEL_ID);
    const block = makeBlock({ durationS: 7 });

    const options = buildStoryboardVideoOptions({
      model,
      block,
      imageFileId: 'image-file-1',
      nextImageFileId: 'image-file-2',
      generateAudio: true,
    });

    expect(options).toMatchObject({
      prompt: 'Push in while the subject turns toward camera.',
      image_url: 'image-file-1',
      end_image_url: 'image-file-2',
      generate_audio: true,
    });
    expect(options).not.toHaveProperty('duration');
    expect(modelSupportsAudio(model)).toBe(true);
  });

  it('clamps numeric duration fields and uses generate_audio_switch when present', () => {
    const options = buildStoryboardVideoOptions({
      model: getModel(PIXVERSE_MODEL_ID),
      block: makeBlock({ durationS: 30 }),
      imageFileId: 'image-file-1',
      generateAudio: true,
    });

    expect(options).toMatchObject({
      duration: 15,
      generate_audio_switch: true,
    });
  });

  it('rejects audio when the selected model does not support it', () => {
    expect(() => buildStoryboardVideoOptions({
      model: getModel(WAN_MODEL_ID),
      block: makeBlock(),
      imageFileId: 'image-file-1',
      generateAudio: true,
    })).toThrow(ValidationError);
  });

  it('enqueues one Image-to-Video job per scene without duplicating active jobs', async () => {
    const block1 = makeBlock({ id: 'block-1', sortOrder: 1 });
    const block2 = makeBlock({ id: 'block-2', sortOrder: 2, videoPrompt: 'Pan across the final result.' });
    mockStoryboardRepo.findBlocksByDraftId.mockResolvedValue([block1, block2]);
    mockStoryboardRepo.findEdgesByDraftId.mockResolvedValue([makeEdge('block-1', 'block-2')]);
    mockIllustrationRepo.findLatestIllustrationJobsByDraftId.mockResolvedValue([
      makeIllustration('block-1', 'image-file-1'),
      makeIllustration('block-2', 'image-file-2'),
    ]);
    mockVideoRepo.findLatestVideoJobsByDraftId
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        makeVideoMapping({ blockId: 'block-1', aiJobId: 'video-job-1' }),
        makeVideoMapping({ blockId: 'block-2', aiJobId: 'video-job-2' }),
      ]);

    const result = await startStoryboardVideos({
      userId: USER_ID,
      draftId: DRAFT_ID,
      modelId: LTX_MODEL_ID,
      generateAudio: true,
    });

    expect(mockAiGenerationService.submitGeneration).toHaveBeenCalledTimes(2);
    expect(mockVideoRepo.createVideoJobMapping).toHaveBeenCalledTimes(2);
    expect(mockAiGenerationService.submitGeneration.mock.calls[0][1]).toMatchObject({
      modelId: LTX_MODEL_ID,
      draftId: DRAFT_ID,
      options: expect.objectContaining({
        image_url: 'image-file-1',
        end_image_url: 'image-file-2',
        generate_audio: true,
      }),
    });
    expect(result.items).toHaveLength(2);

    mockAiGenerationService.submitGeneration.mockClear();
    mockVideoRepo.findLatestVideoJobsByDraftId.mockResolvedValue([
      makeVideoMapping({ blockId: 'block-1', aiJobId: 'video-job-1', status: 'queued' }),
      makeVideoMapping({ blockId: 'block-2', aiJobId: 'video-job-2', status: 'ready', outputFileId: 'video-file-2' }),
    ]);

    await startStoryboardVideos({
      userId: USER_ID,
      draftId: DRAFT_ID,
      modelId: LTX_MODEL_ID,
      generateAudio: true,
    });

    expect(mockAiGenerationService.submitGeneration).not.toHaveBeenCalled();
  });

  it('fails before enqueue when a scene has no video prompt', async () => {
    mockStoryboardRepo.findBlocksByDraftId.mockResolvedValue([
      makeBlock({ id: 'block-1', videoPrompt: 'Valid motion prompt.' }),
      makeBlock({ id: 'block-2', videoPrompt: '   ' }),
    ]);
    mockIllustrationRepo.findLatestIllustrationJobsByDraftId.mockResolvedValue([
      makeIllustration('block-1', 'image-file-1'),
      makeIllustration('block-2', 'image-file-2'),
    ]);

    await expect(startStoryboardVideos({
      userId: USER_ID,
      draftId: DRAFT_ID,
      modelId: LTX_MODEL_ID,
      generateAudio: false,
    })).rejects.toThrow(UnprocessableEntityError);

    expect(mockAiGenerationService.submitGeneration).not.toHaveBeenCalled();
    expect(mockVideoRepo.createVideoJobMapping).not.toHaveBeenCalled();
  });

  it('fails before enqueue when a scene has no ready generated image', async () => {
    mockStoryboardRepo.findBlocksByDraftId.mockResolvedValue([
      makeBlock({ id: 'block-1', videoPrompt: 'Valid motion prompt.' }),
      makeBlock({ id: 'block-2', videoPrompt: 'Another valid motion prompt.' }),
    ]);
    mockIllustrationRepo.findLatestIllustrationJobsByDraftId.mockResolvedValue([
      makeIllustration('block-1', 'image-file-1'),
    ]);

    await expect(startStoryboardVideos({
      userId: USER_ID,
      draftId: DRAFT_ID,
      modelId: LTX_MODEL_ID,
      generateAudio: false,
    })).rejects.toThrow(/no ready generated image/);

    expect(mockAiGenerationService.submitGeneration).not.toHaveBeenCalled();
    expect(mockVideoRepo.createVideoJobMapping).not.toHaveBeenCalled();
  });

  it('continues without surfacing an error when the active mapping insert loses a race', async () => {
    mockVideoRepo.createVideoJobMapping.mockResolvedValue(false);
    mockVideoRepo.findLatestVideoJobsByDraftId
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        makeVideoMapping({ blockId: 'block-1', aiJobId: 'video-job-existing', status: 'queued' }),
      ]);

    const result = await startStoryboardVideos({
      userId: USER_ID,
      draftId: DRAFT_ID,
      modelId: LTX_MODEL_ID,
      generateAudio: false,
    });

    expect(mockAiGenerationService.submitGeneration).toHaveBeenCalledOnce();
    expect(result.items[0]).toMatchObject({
      blockId: 'block-1',
      status: 'queued',
      jobId: 'video-job-existing',
    });
  });

  it('refreshes completed AI jobs into ready video statuses', async () => {
    mockVideoRepo.findLatestVideoJobsByDraftId.mockResolvedValue([
      makeVideoMapping({ status: 'running', outputFileId: null }),
    ]);
    mockAiJobRepo.getJobById.mockResolvedValue({
      jobId: 'video-job-1',
      userId: USER_ID,
      modelId: LTX_MODEL_ID,
      capability: 'image_to_video',
      prompt: 'Prompt',
      options: null,
      status: 'completed',
      progress: 100,
      outputFileId: 'video-file-1',
      draftId: DRAFT_ID,
      resultUrl: null,
      errorMessage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await listStoryboardVideos(USER_ID, DRAFT_ID);

    expect(mockVideoRepo.setVideoJobOutput).toHaveBeenCalledWith({
      aiJobId: 'video-job-1',
      outputFileId: 'video-file-1',
    });
    expect(result.items[0]).toMatchObject({
      blockId: 'block-1',
      status: 'ready',
      jobId: 'video-job-1',
      modelId: LTX_MODEL_ID,
      generateAudio: false,
      outputFileId: 'video-file-1',
      errorMessage: null,
    });
  });

  it('refreshes failed AI jobs into failed video statuses with errors', async () => {
    mockVideoRepo.findLatestVideoJobsByDraftId.mockResolvedValue([
      makeVideoMapping({ status: 'running', outputFileId: null }),
    ]);
    mockAiJobRepo.getJobById.mockResolvedValue({
      jobId: 'video-job-1',
      userId: USER_ID,
      modelId: LTX_MODEL_ID,
      capability: 'image_to_video',
      prompt: 'Prompt',
      options: null,
      status: 'failed',
      progress: 10,
      outputFileId: null,
      draftId: DRAFT_ID,
      resultUrl: null,
      errorMessage: 'provider failed',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await listStoryboardVideos(USER_ID, DRAFT_ID);

    expect(mockVideoRepo.updateVideoJobStatus).toHaveBeenCalledWith({
      aiJobId: 'video-job-1',
      status: 'failed',
      errorMessage: 'provider failed',
    });
    expect(result.items[0]).toMatchObject({
      blockId: 'block-1',
      status: 'failed',
      jobId: 'video-job-1',
      modelId: LTX_MODEL_ID,
      generateAudio: false,
      outputFileId: null,
      errorMessage: 'provider failed',
    });
  });
});
