import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockAiGenerationService,
  mockAiJobRepo,
  mockDraftRepo,
  mockStoryboardRepo,
  mockIllustrationRepo,
} = vi.hoisted(() => ({
  mockAiGenerationService: { submitGeneration: vi.fn() },
  mockAiJobRepo: { getJobById: vi.fn(), setDraftId: vi.fn() },
  mockDraftRepo: { findDraftById: vi.fn() },
  mockStoryboardRepo: { findBlocksByDraftId: vi.fn() },
  mockIllustrationRepo: {
    createIllustrationJobMapping: vi.fn(),
    attachIllustrationOutputToBlock: vi.fn(),
    findLatestIllustrationJobsByDraftId: vi.fn(),
    setIllustrationJobOutput: vi.fn(),
    toSceneIllustrationStatus: vi.fn((status: string) => {
      if (status === 'processing') return 'running';
      if (status === 'completed') return 'ready';
      return status;
    }),
    updateIllustrationJobStatus: vi.fn(),
  },
}));

vi.mock('@/services/aiGeneration.service.js', () => mockAiGenerationService);
vi.mock('@/repositories/aiGenerationJob.repository.js', () => mockAiJobRepo);
vi.mock('@/repositories/generationDraft.repository.js', () => mockDraftRepo);
vi.mock('@/repositories/storyboard.repository.js', () => mockStoryboardRepo);
vi.mock('@/repositories/storyboardSceneIllustration.repository.js', () => mockIllustrationRepo);

import { ForbiddenError, NotFoundError, UnprocessableEntityError } from '@/lib/errors.js';
import type { StoryboardBlock } from '@/repositories/storyboard.repository.js';
import {
  buildStoryboardIllustrationOptions,
  listStoryboardIllustrations,
  startStoryboardBlockIllustration,
  startStoryboardIllustrations,
} from './storyboardIllustration.service.js';

const USER_ID = 'user-1';
const OTHER_USER_ID = 'user-2';
const DRAFT_ID = 'draft-1';

function makeDraft(overrides: Record<string, unknown> = {}) {
  return {
    id: DRAFT_ID,
    userId: USER_ID,
    promptDoc: {
      schemaVersion: 1,
      blocks: [{ type: 'text', value: 'Prompt' }],
      settings: {
        videoLengthSeconds: 30,
        aspectRatio: '16:9',
        styleKey: 'cinematic',
        modelPreference: null,
      },
    },
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
    prompt: 'A bright product hero image.',
    durationS: 5,
    positionX: 0,
    positionY: 0,
    sortOrder: 1,
    style: 'cinematic',
    createdAt: new Date(),
    updatedAt: new Date(),
    mediaItems: [],
    ...overrides,
  };
}

function makeMapping(overrides: Record<string, unknown> = {}) {
  return {
    id: 'map-1',
    draftId: DRAFT_ID,
    blockId: 'block-1',
    aiJobId: 'job-1',
    status: 'queued',
    outputFileId: null,
    errorMessage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('storyboardIllustration.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDraftRepo.findDraftById.mockResolvedValue(makeDraft());
    mockStoryboardRepo.findBlocksByDraftId.mockResolvedValue([makeBlock()]);
    mockIllustrationRepo.findLatestIllustrationJobsByDraftId.mockResolvedValue([]);
    mockAiGenerationService.submitGeneration.mockImplementation(
      async (_userId: string, params: { beforeEnqueue?: (jobId: string) => Promise<void> }) => {
        await params.beforeEnqueue?.('job-new');
        return { jobId: 'job-new', status: 'queued' };
      },
    );
    mockAiJobRepo.setDraftId.mockResolvedValue(undefined);
    mockAiJobRepo.getJobById.mockResolvedValue(null);
    mockIllustrationRepo.createIllustrationJobMapping.mockResolvedValue(true);
    mockIllustrationRepo.attachIllustrationOutputToBlock.mockResolvedValue(undefined);
    mockIllustrationRepo.setIllustrationJobOutput.mockResolvedValue(undefined);
    mockIllustrationRepo.updateIllustrationJobStatus.mockResolvedValue(undefined);
  });

  it('builds centralized low-cost storyboard illustration options by aspect ratio', () => {
    expect(
      buildStoryboardIllustrationOptions({ prompt: 'Prompt', aspectRatio: '16:9' }),
    ).toMatchObject({
      prompt: 'Prompt',
      image_size: 'landscape_16_9',
      quality: 'low',
      num_images: 1,
      output_format: 'png',
      sync_mode: false,
    });
    expect(
      buildStoryboardIllustrationOptions({ prompt: 'Prompt', aspectRatio: '9:16' })['image_size'],
    ).toBe('portrait_16_9');
    expect(
      buildStoryboardIllustrationOptions({ prompt: 'Prompt', aspectRatio: '1:1' })['image_size'],
    ).toBe('square');
  });

  it('enqueues missing scene illustration jobs and draft-scopes the AI job', async () => {
    mockIllustrationRepo.findLatestIllustrationJobsByDraftId
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeMapping({ aiJobId: 'job-new' })]);

    const result = await startStoryboardIllustrations(USER_ID, DRAFT_ID);

    expect(result.items).toEqual([
      {
        blockId: 'block-1',
        status: 'queued',
        jobId: 'job-new',
        outputFileId: null,
        errorMessage: null,
      },
    ]);
    expect(mockAiGenerationService.submitGeneration).toHaveBeenCalledWith(USER_ID, {
      modelId: 'openai/gpt-image-2',
      prompt: 'A bright product hero image.\n\nStyle: cinematic',
      draftId: DRAFT_ID,
      beforeEnqueue: expect.any(Function),
      options: expect.objectContaining({
        prompt: 'A bright product hero image.\n\nStyle: cinematic',
        image_size: 'landscape_16_9',
        quality: 'low',
      }),
    });
    expect(mockIllustrationRepo.createIllustrationJobMapping).toHaveBeenCalledWith(
      expect.objectContaining({
        draftId: DRAFT_ID,
        blockId: 'block-1',
        aiJobId: 'job-new',
        status: 'queued',
      }),
    );
  });

  it('does not duplicate queued or running jobs', async () => {
    mockIllustrationRepo.findLatestIllustrationJobsByDraftId.mockResolvedValue([
      makeMapping({ status: 'queued' }),
    ]);

    await startStoryboardIllustrations(USER_ID, DRAFT_ID);

    expect(mockAiGenerationService.submitGeneration).not.toHaveBeenCalled();
    expect(mockIllustrationRepo.createIllustrationJobMapping).not.toHaveBeenCalled();
  });

  it('retries failed scenes from the all-scenes endpoint', async () => {
    mockIllustrationRepo.findLatestIllustrationJobsByDraftId.mockResolvedValue([
      makeMapping({ status: 'failed', errorMessage: 'provider failed' }),
    ]);

    await startStoryboardIllustrations(USER_ID, DRAFT_ID);

    expect(mockAiGenerationService.submitGeneration).toHaveBeenCalledOnce();
  });

  it('does not duplicate a ready scene on explicit start', async () => {
    mockIllustrationRepo.findLatestIllustrationJobsByDraftId.mockResolvedValue([
      makeMapping({ status: 'ready', outputFileId: 'file-1' }),
    ]);

    await startStoryboardBlockIllustration(USER_ID, DRAFT_ID, 'block-1');

    expect(mockAiGenerationService.submitGeneration).not.toHaveBeenCalled();
  });

  it('swallows concurrent active mapping races after the DB guard rejects the insert', async () => {
    mockIllustrationRepo.findLatestIllustrationJobsByDraftId.mockResolvedValue([]);
    mockIllustrationRepo.createIllustrationJobMapping.mockResolvedValue(false);

    await expect(startStoryboardBlockIllustration(USER_ID, DRAFT_ID, 'block-1')).resolves.toEqual({
      items: [
        {
          blockId: 'block-1',
          status: 'queued',
          jobId: null,
          outputFileId: null,
          errorMessage: null,
        },
      ],
    });
    expect(mockAiGenerationService.submitGeneration).toHaveBeenCalledOnce();
  });

  it('lists scene statuses in storyboard order and refreshes completed AI jobs', async () => {
    mockStoryboardRepo.findBlocksByDraftId.mockResolvedValue([
      makeBlock({ id: 'start', blockType: 'start', sortOrder: 0 }),
      makeBlock({ id: 'block-1', sortOrder: 1 }),
      makeBlock({ id: 'block-2', sortOrder: 2 }),
    ]);
    mockIllustrationRepo.findLatestIllustrationJobsByDraftId.mockResolvedValue([
      makeMapping({ blockId: 'block-1', aiJobId: 'job-1', status: 'running' }),
    ]);
    mockAiJobRepo.getJobById.mockResolvedValue({
      jobId: 'job-1',
      status: 'completed',
      outputFileId: 'file-1',
      errorMessage: null,
    });

    const result = await listStoryboardIllustrations(USER_ID, DRAFT_ID);

    expect(result.items).toEqual([
      {
        blockId: 'block-1',
        status: 'ready',
        jobId: 'job-1',
        outputFileId: 'file-1',
        errorMessage: null,
      },
      {
        blockId: 'block-2',
        status: 'queued',
        jobId: null,
        outputFileId: null,
        errorMessage: null,
      },
    ]);
    expect(mockIllustrationRepo.attachIllustrationOutputToBlock).toHaveBeenCalledWith({
      id: expect.any(String),
      aiJobId: 'job-1',
      outputFileId: 'file-1',
    });
  });

  it('preserves missing draft, wrong owner, missing block, and empty prompt errors', async () => {
    mockDraftRepo.findDraftById.mockResolvedValueOnce(null);
    await expect(startStoryboardIllustrations(USER_ID, DRAFT_ID)).rejects.toThrow(NotFoundError);

    mockDraftRepo.findDraftById.mockResolvedValueOnce(makeDraft({ userId: OTHER_USER_ID }));
    await expect(startStoryboardIllustrations(USER_ID, DRAFT_ID)).rejects.toThrow(ForbiddenError);

    mockDraftRepo.findDraftById.mockResolvedValueOnce(makeDraft());
    await expect(startStoryboardBlockIllustration(USER_ID, DRAFT_ID, 'missing')).rejects.toThrow(
      NotFoundError,
    );

    mockDraftRepo.findDraftById.mockResolvedValueOnce(makeDraft());
    mockStoryboardRepo.findBlocksByDraftId.mockResolvedValueOnce([
      makeBlock({ prompt: '   ' }),
    ]);
    await expect(startStoryboardIllustrations(USER_ID, DRAFT_ID)).rejects.toThrow(
      UnprocessableEntityError,
    );
  });
});
