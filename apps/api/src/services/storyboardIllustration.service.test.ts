import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockAiGenerationService,
  mockAiJobRepo,
  mockDraftRepo,
  mockFileLinksRepo,
  mockStoryboardRepo,
  mockIllustrationRepo,
  mockReferenceRepo,
  mockStoryboardOpenAIQueue,
} = vi.hoisted(() => ({
  mockAiGenerationService: { submitGeneration: vi.fn() },
  mockAiJobRepo: {
    createJob: vi.fn(),
    getJobById: vi.fn(),
    setDraftId: vi.fn(),
    updateJobStatus: vi.fn(),
  },
  mockDraftRepo: { findDraftById: vi.fn() },
  mockFileLinksRepo: { findFilesByDraftId: vi.fn() },
  mockStoryboardRepo: { findBlocksByDraftId: vi.fn(), findEdgesByDraftId: vi.fn() },
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
  mockReferenceRepo: {
    createReferenceMapping: vi.fn(),
    findLatestReferenceByDraftId: vi.fn(),
    setReferenceOutput: vi.fn(),
    toStoryboardIllustrationReferenceStatus: vi.fn((status: string) => {
      if (status === 'processing') return 'running';
      if (status === 'completed') return 'ready';
      return status;
    }),
    updateReferenceStatus: vi.fn(),
  },
  mockStoryboardOpenAIQueue: { enqueueStoryboardOpenAIImage: vi.fn() },
}));

vi.mock('@/services/aiGeneration.service.js', () => mockAiGenerationService);
vi.mock('@/repositories/aiGenerationJob.repository.js', () => mockAiJobRepo);
vi.mock('@/repositories/fileLinks.repository.js', () => mockFileLinksRepo);
vi.mock('@/repositories/generationDraft.repository.js', () => mockDraftRepo);
vi.mock('@/repositories/storyboard.repository.js', () => mockStoryboardRepo);
vi.mock('@/repositories/storyboardSceneIllustration.repository.js', () => mockIllustrationRepo);
vi.mock('@/repositories/storyboardIllustrationReference.repository.js', () => mockReferenceRepo);
vi.mock('@/queues/jobs/enqueue-storyboard-openai-image.js', () => mockStoryboardOpenAIQueue);

import { ForbiddenError, NotFoundError, UnprocessableEntityError } from '@/lib/errors.js';
import type { StoryboardBlock, StoryboardEdge } from '@/repositories/storyboard.repository.js';
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

function makeEdge(sourceBlockId: string, targetBlockId: string): StoryboardEdge {
  return {
    id: `${sourceBlockId}-${targetBlockId}`,
    draftId: DRAFT_ID,
    sourceBlockId,
    targetBlockId,
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

function makeReference(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ref-1',
    draftId: DRAFT_ID,
    aiJobId: 'ref-job-1',
    status: 'ready',
    outputFileId: 'ref-file-1',
    sourceReferenceFileIds: [],
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
    mockStoryboardRepo.findEdgesByDraftId.mockResolvedValue([]);
    mockIllustrationRepo.findLatestIllustrationJobsByDraftId.mockResolvedValue([]);
    mockAiGenerationService.submitGeneration.mockImplementation(
      async (_userId: string, params: { beforeEnqueue?: (jobId: string) => Promise<void> }) => {
        await params.beforeEnqueue?.('job-new');
        return { jobId: 'job-new', status: 'queued' };
      },
    );
    mockAiJobRepo.setDraftId.mockResolvedValue(undefined);
    mockAiJobRepo.createJob.mockResolvedValue(undefined);
    mockAiJobRepo.getJobById.mockResolvedValue(null);
    mockAiJobRepo.updateJobStatus.mockResolvedValue(undefined);
    mockFileLinksRepo.findFilesByDraftId.mockResolvedValue([]);
    mockIllustrationRepo.createIllustrationJobMapping.mockResolvedValue(true);
    mockIllustrationRepo.attachIllustrationOutputToBlock.mockResolvedValue(undefined);
    mockIllustrationRepo.setIllustrationJobOutput.mockResolvedValue(undefined);
    mockIllustrationRepo.updateIllustrationJobStatus.mockResolvedValue(undefined);
    mockReferenceRepo.findLatestReferenceByDraftId.mockResolvedValue(makeReference());
    mockReferenceRepo.createReferenceMapping.mockResolvedValue(true);
    mockReferenceRepo.setReferenceOutput.mockResolvedValue(undefined);
    mockReferenceRepo.updateReferenceStatus.mockResolvedValue(undefined);
    mockStoryboardOpenAIQueue.enqueueStoryboardOpenAIImage.mockResolvedValue(undefined);
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

    expect(result.reference).toEqual({
      status: 'ready',
      jobId: 'ref-job-1',
      outputFileId: 'ref-file-1',
      sourceReferenceFileIds: [],
      errorMessage: null,
    });
    expect(result.items).toEqual([
      {
        blockId: 'block-1',
        status: 'queued',
        jobId: 'job-new',
        outputFileId: null,
        errorMessage: null,
      },
    ]);
    expect(mockAiJobRepo.createJob).toHaveBeenCalledWith(expect.objectContaining({
      userId: USER_ID,
      modelId: 'gpt-image-2',
      capability: 'image_edit',
      prompt: 'A bright product hero image.\n\nStyle: cinematic',
      options: expect.objectContaining({
        kind: 'scene',
        blockId: 'block-1',
        referenceFileIds: ['ref-file-1'],
        previousSceneFileId: null,
        size: '1536x1024',
      }),
    }));
    expect(mockAiJobRepo.setDraftId).toHaveBeenCalledWith(expect.any(String), DRAFT_ID);
    expect(mockIllustrationRepo.createIllustrationJobMapping).toHaveBeenCalledWith(
      expect.objectContaining({
        draftId: DRAFT_ID,
        blockId: 'block-1',
        aiJobId: expect.any(String),
        status: 'queued',
      }),
    );
    expect(mockStoryboardOpenAIQueue.enqueueStoryboardOpenAIImage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        draftId: DRAFT_ID,
        kind: 'scene',
        blockId: 'block-1',
        referenceFileIds: ['ref-file-1'],
        previousSceneFileId: undefined,
        size: '1536x1024',
      }),
    );
    expect(mockAiGenerationService.submitGeneration).not.toHaveBeenCalled();
  });

  it('creates a text-only canonical reference before scene jobs and returns without scene enqueue', async () => {
    mockReferenceRepo.findLatestReferenceByDraftId
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(makeReference({ status: 'queued', outputFileId: null }));

    const result = await startStoryboardIllustrations(USER_ID, DRAFT_ID);

    expect(result.reference).toEqual({
      status: 'queued',
      jobId: expect.any(String),
      outputFileId: null,
      sourceReferenceFileIds: [],
      errorMessage: null,
    });
    expect(result.items).toEqual([
      {
        blockId: 'block-1',
        status: 'queued',
        jobId: null,
        outputFileId: null,
        errorMessage: null,
      },
    ]);
    expect(mockAiJobRepo.createJob).toHaveBeenCalledWith(expect.objectContaining({
      userId: USER_ID,
      modelId: 'gpt-image-2',
      capability: 'text_to_image',
      prompt: expect.stringContaining('canonical visual style reference'),
    }));
    expect(mockReferenceRepo.createReferenceMapping).toHaveBeenCalledWith(expect.objectContaining({
      draftId: DRAFT_ID,
      sourceReferenceFileIds: [],
      status: 'queued',
    }));
    expect(mockStoryboardOpenAIQueue.enqueueStoryboardOpenAIImage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        draftId: DRAFT_ID,
        kind: 'style_reference',
        referenceFileIds: [],
        size: '1536x1024',
      }),
    );
    expect(mockAiGenerationService.submitGeneration).not.toHaveBeenCalled();
  });

  it('does not enqueue scene jobs from explicit block start until the reference is ready', async () => {
    mockReferenceRepo.findLatestReferenceByDraftId.mockResolvedValue(null);

    const result = await startStoryboardBlockIllustration(USER_ID, DRAFT_ID, 'block-1');

    expect(result.items).toEqual([
      {
        blockId: 'block-1',
        status: 'queued',
        jobId: null,
        outputFileId: null,
        errorMessage: null,
      },
    ]);
    expect(mockStoryboardOpenAIQueue.enqueueStoryboardOpenAIImage).toHaveBeenCalledOnce();
    expect(mockAiGenerationService.submitGeneration).not.toHaveBeenCalled();
  });

  it('does not create a canonical reference for an explicit empty-prompt scene request', async () => {
    mockReferenceRepo.findLatestReferenceByDraftId.mockResolvedValue(null);
    mockStoryboardRepo.findBlocksByDraftId.mockResolvedValue([
      makeBlock({ prompt: '   ' }),
    ]);

    await expect(startStoryboardBlockIllustration(USER_ID, DRAFT_ID, 'block-1')).rejects.toThrow(
      UnprocessableEntityError,
    );
    expect(mockAiJobRepo.createJob).not.toHaveBeenCalled();
    expect(mockStoryboardOpenAIQueue.enqueueStoryboardOpenAIImage).not.toHaveBeenCalled();
  });

  it('marks duplicate active canonical reference races failed without enqueueing worker work', async () => {
    mockReferenceRepo.findLatestReferenceByDraftId.mockResolvedValue(null);
    mockReferenceRepo.createReferenceMapping.mockResolvedValue(false);

    await startStoryboardIllustrations(USER_ID, DRAFT_ID);

    expect(mockAiJobRepo.createJob).toHaveBeenCalledOnce();
    expect(mockAiJobRepo.updateJobStatus).toHaveBeenCalledWith(
      expect.any(String),
      'failed',
      'Active storyboard reference already exists',
    );
    expect(mockStoryboardOpenAIQueue.enqueueStoryboardOpenAIImage).not.toHaveBeenCalled();
    expect(mockAiGenerationService.submitGeneration).not.toHaveBeenCalled();
  });

  it('creates an image-edit canonical reference from linked ready image media refs', async () => {
    const imageFileId = '00000000-0000-4000-8000-000000000123';
    mockReferenceRepo.findLatestReferenceByDraftId.mockResolvedValue(null);
    mockDraftRepo.findDraftById.mockResolvedValue(makeDraft({
      promptDoc: {
        schemaVersion: 1,
        blocks: [
          { type: 'text', value: 'Prompt' },
          { type: 'media-ref', mediaType: 'image', fileId: imageFileId, label: 'Image' },
          { type: 'media-ref', mediaType: 'video', fileId: '00000000-0000-4000-8000-000000000124', label: 'Video' },
        ],
        settings: {
          videoLengthSeconds: 30,
          aspectRatio: '1:1',
          styleKey: 'product',
          modelPreference: null,
        },
      },
    }));
    mockFileLinksRepo.findFilesByDraftId.mockResolvedValue([
      {
        fileId: imageFileId,
        userId: USER_ID,
        kind: 'image',
        status: 'ready',
      },
    ]);

    await startStoryboardIllustrations(USER_ID, DRAFT_ID);

    expect(mockAiJobRepo.createJob).toHaveBeenCalledWith(expect.objectContaining({
      capability: 'image_edit',
      options: expect.objectContaining({
        sourceReferenceFileIds: [imageFileId],
        size: '1024x1024',
      }),
    }));
    expect(mockReferenceRepo.createReferenceMapping).toHaveBeenCalledWith(expect.objectContaining({
      sourceReferenceFileIds: [imageFileId],
    }));
    expect(mockStoryboardOpenAIQueue.enqueueStoryboardOpenAIImage).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceFileIds: [imageFileId],
        size: '1024x1024',
      }),
    );
  });

  it('rejects unavailable prompt image references before creating a reference job', async () => {
    mockReferenceRepo.findLatestReferenceByDraftId.mockResolvedValue(null);
    mockDraftRepo.findDraftById.mockResolvedValue(makeDraft({
      promptDoc: {
        schemaVersion: 1,
        blocks: [
          {
            type: 'media-ref',
            mediaType: 'image',
            fileId: '00000000-0000-4000-8000-000000000125',
            label: 'Missing image',
          },
        ],
      },
    }));
    mockFileLinksRepo.findFilesByDraftId.mockResolvedValue([]);

    await expect(startStoryboardIllustrations(USER_ID, DRAFT_ID)).rejects.toThrow(
      UnprocessableEntityError,
    );
    expect(mockAiJobRepo.createJob).not.toHaveBeenCalled();
    expect(mockStoryboardOpenAIQueue.enqueueStoryboardOpenAIImage).not.toHaveBeenCalled();
  });

  it('rejects linked but not-ready image references before creating a reference job', async () => {
    const imageFileId = '00000000-0000-4000-8000-000000000126';
    mockReferenceRepo.findLatestReferenceByDraftId.mockResolvedValue(null);
    mockDraftRepo.findDraftById.mockResolvedValue(makeDraft({
      promptDoc: {
        schemaVersion: 1,
        blocks: [
          {
            type: 'media-ref',
            mediaType: 'image',
            fileId: imageFileId,
            label: 'Processing image',
          },
        ],
      },
    }));
    mockFileLinksRepo.findFilesByDraftId.mockResolvedValue([
      {
        fileId: imageFileId,
        userId: USER_ID,
        kind: 'image',
        status: 'processing',
      },
    ]);

    await expect(startStoryboardIllustrations(USER_ID, DRAFT_ID)).rejects.toThrow(
      UnprocessableEntityError,
    );
    expect(mockAiJobRepo.createJob).not.toHaveBeenCalled();
    expect(mockStoryboardOpenAIQueue.enqueueStoryboardOpenAIImage).not.toHaveBeenCalled();
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

    expect(mockAiJobRepo.createJob).toHaveBeenCalledWith(expect.objectContaining({
      modelId: 'gpt-image-2',
      capability: 'image_edit',
    }));
    expect(mockStoryboardOpenAIQueue.enqueueStoryboardOpenAIImage).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'scene',
        blockId: 'block-1',
        referenceFileIds: ['ref-file-1'],
      }),
    );
    expect(mockAiGenerationService.submitGeneration).not.toHaveBeenCalled();
  });

  it('only enqueues the next missing scene whose previous scene is ready', async () => {
    mockStoryboardRepo.findBlocksByDraftId.mockResolvedValue([
      makeBlock({ id: 'block-1', sortOrder: 1 }),
      makeBlock({ id: 'block-2', sortOrder: 2 }),
    ]);
    mockIllustrationRepo.findLatestIllustrationJobsByDraftId
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        makeMapping({ blockId: 'block-1', aiJobId: 'job-created', status: 'queued' }),
      ]);

    await startStoryboardIllustrations(USER_ID, DRAFT_ID);

    expect(mockIllustrationRepo.createIllustrationJobMapping).toHaveBeenCalledOnce();
    expect(mockIllustrationRepo.createIllustrationJobMapping).toHaveBeenCalledWith(
      expect.objectContaining({ blockId: 'block-1' }),
    );
    expect(mockStoryboardOpenAIQueue.enqueueStoryboardOpenAIImage).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'scene',
        blockId: 'block-1',
        referenceFileIds: ['ref-file-1'],
        previousSceneFileId: undefined,
      }),
    );
  });

  it('passes the previous ready scene output to the next scene image-edit job', async () => {
    mockStoryboardRepo.findBlocksByDraftId.mockResolvedValue([
      makeBlock({ id: 'block-1', sortOrder: 1 }),
      makeBlock({ id: 'block-2', sortOrder: 2 }),
    ]);
    mockIllustrationRepo.findLatestIllustrationJobsByDraftId.mockResolvedValue([
      makeMapping({
        blockId: 'block-1',
        aiJobId: 'job-ready',
        status: 'ready',
        outputFileId: 'scene-1-file',
      }),
    ]);

    await startStoryboardIllustrations(USER_ID, DRAFT_ID);

    expect(mockStoryboardOpenAIQueue.enqueueStoryboardOpenAIImage).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'scene',
        blockId: 'block-2',
        referenceFileIds: ['ref-file-1'],
        previousSceneFileId: 'scene-1-file',
      }),
    );
  });

  it('uses START to END graph order before falling back to sort order', async () => {
    mockStoryboardRepo.findBlocksByDraftId.mockResolvedValue([
      makeBlock({ id: 'start', blockType: 'start', sortOrder: 0 }),
      makeBlock({ id: 'block-1', sortOrder: 1 }),
      makeBlock({ id: 'block-2', sortOrder: 2 }),
      makeBlock({ id: 'end', blockType: 'end', sortOrder: 3 }),
    ]);
    mockStoryboardRepo.findEdgesByDraftId.mockResolvedValue([
      makeEdge('start', 'block-2'),
      makeEdge('block-2', 'block-1'),
      makeEdge('block-1', 'end'),
    ]);
    mockIllustrationRepo.findLatestIllustrationJobsByDraftId
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        makeMapping({ blockId: 'block-2', aiJobId: 'job-created', status: 'queued' }),
      ]);

    const result = await startStoryboardIllustrations(USER_ID, DRAFT_ID);

    expect(mockIllustrationRepo.createIllustrationJobMapping).toHaveBeenCalledWith(
      expect.objectContaining({ blockId: 'block-2' }),
    );
    expect(result.items.map((item) => item.blockId)).toEqual(['block-2', 'block-1']);
  });

  it('does not enqueue an explicit scene retry until its previous scene output is ready', async () => {
    mockStoryboardRepo.findBlocksByDraftId.mockResolvedValue([
      makeBlock({ id: 'block-1', sortOrder: 1 }),
      makeBlock({ id: 'block-2', sortOrder: 2 }),
    ]);
    mockIllustrationRepo.findLatestIllustrationJobsByDraftId.mockResolvedValue([
      makeMapping({ blockId: 'block-2', aiJobId: 'job-failed', status: 'failed' }),
    ]);

    await startStoryboardBlockIllustration(USER_ID, DRAFT_ID, 'block-2');

    expect(mockIllustrationRepo.createIllustrationJobMapping).not.toHaveBeenCalled();
    expect(mockStoryboardOpenAIQueue.enqueueStoryboardOpenAIImage).not.toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'scene' }),
    );
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

    const result = await startStoryboardBlockIllustration(USER_ID, DRAFT_ID, 'block-1');

    expect(result.reference).toMatchObject({
      status: 'ready',
      jobId: 'ref-job-1',
      outputFileId: 'ref-file-1',
    });
    expect(result.items).toEqual([
      {
        blockId: 'block-1',
        status: 'queued',
        jobId: null,
        outputFileId: null,
        errorMessage: null,
      },
    ]);
    expect(mockAiJobRepo.createJob).toHaveBeenCalledWith(expect.objectContaining({
      modelId: 'gpt-image-2',
      capability: 'image_edit',
    }));
    expect(mockAiJobRepo.updateJobStatus).toHaveBeenCalledWith(
      expect.any(String),
      'failed',
      'Active storyboard scene illustration already exists',
    );
    expect(mockStoryboardOpenAIQueue.enqueueStoryboardOpenAIImage).not.toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'scene' }),
    );
    expect(mockAiGenerationService.submitGeneration).not.toHaveBeenCalled();
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

  it('self-heals stale scene mappings that already have an output file', async () => {
    mockStoryboardRepo.findBlocksByDraftId.mockResolvedValue([
      makeBlock({ id: 'block-1', sortOrder: 1 }),
    ]);
    mockIllustrationRepo.findLatestIllustrationJobsByDraftId.mockResolvedValue([
      makeMapping({
        blockId: 'block-1',
        aiJobId: 'job-1',
        status: 'running',
        outputFileId: 'file-1',
      }),
    ]);

    const result = await listStoryboardIllustrations(USER_ID, DRAFT_ID);

    expect(result.items[0]).toMatchObject({
      blockId: 'block-1',
      status: 'ready',
      jobId: 'job-1',
      outputFileId: 'file-1',
      errorMessage: null,
    });
    expect(mockIllustrationRepo.setIllustrationJobOutput).toHaveBeenCalledWith({
      aiJobId: 'job-1',
      outputFileId: 'file-1',
    });
    expect(mockAiJobRepo.getJobById).not.toHaveBeenCalledWith('job-1');
  });

  it('refreshes completed canonical reference jobs during status polling', async () => {
    mockReferenceRepo.findLatestReferenceByDraftId.mockResolvedValue(makeReference({
      aiJobId: 'ref-job-1',
      status: 'running',
      outputFileId: null,
    }));
    mockAiJobRepo.getJobById.mockImplementation(async (jobId: string) => {
      if (jobId === 'ref-job-1') {
        return {
          jobId,
          status: 'completed',
          outputFileId: 'ref-file-ready',
          errorMessage: null,
        };
      }
      return null;
    });

    await listStoryboardIllustrations(USER_ID, DRAFT_ID);

    expect(mockReferenceRepo.setReferenceOutput).toHaveBeenCalledWith({
      aiJobId: 'ref-job-1',
      outputFileId: 'ref-file-ready',
    });
  });

  it('self-heals stale canonical references that already have an output file', async () => {
    mockReferenceRepo.findLatestReferenceByDraftId.mockResolvedValue(makeReference({
      aiJobId: 'ref-job-1',
      status: 'running',
      outputFileId: 'ref-file-ready',
    }));

    const result = await listStoryboardIllustrations(USER_ID, DRAFT_ID);

    expect(result.reference).toMatchObject({
      status: 'ready',
      jobId: 'ref-job-1',
      outputFileId: 'ref-file-ready',
      errorMessage: null,
    });
    expect(mockReferenceRepo.setReferenceOutput).toHaveBeenCalledWith({
      aiJobId: 'ref-job-1',
      outputFileId: 'ref-file-ready',
    });
    expect(mockAiJobRepo.getJobById).not.toHaveBeenCalledWith('ref-job-1');
  });

  it('refreshes failed canonical reference jobs during status polling so they are retryable', async () => {
    mockReferenceRepo.findLatestReferenceByDraftId.mockResolvedValue(makeReference({
      aiJobId: 'ref-job-1',
      status: 'running',
      outputFileId: null,
    }));
    mockAiJobRepo.getJobById.mockImplementation(async (jobId: string) => {
      if (jobId === 'ref-job-1') {
        return {
          jobId,
          status: 'failed',
          outputFileId: null,
          errorMessage: 'Safe provider failure',
        };
      }
      return null;
    });

    await listStoryboardIllustrations(USER_ID, DRAFT_ID);

    expect(mockReferenceRepo.updateReferenceStatus).toHaveBeenCalledWith({
      aiJobId: 'ref-job-1',
      status: 'failed',
      errorMessage: 'Safe provider failure',
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
