import type { StoryboardPlan } from '@ai-video-editor/project-schema';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockConn,
  mockGenDraftRepo,
  mockStoryboardRepo,
  mockStoryboardHistoryRepo,
  mockStoryboardPlanJobRepo,
} = vi.hoisted(() => {
  const mockConn = {
    beginTransaction: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
    release: vi.fn(),
    execute: vi.fn().mockResolvedValue([{ insertId: 1 }, []]),
    query: vi.fn().mockResolvedValue([[], []]),
  };

  const mockGenDraftRepo = {
    findDraftById: vi.fn(),
  };

  const mockStoryboardRepo = {
    findBlocksByDraftId: vi.fn(),
    findEdgesByDraftId: vi.fn().mockResolvedValue([]),
    replaceStoryboard: vi.fn().mockResolvedValue(undefined),
    getConnection: vi.fn().mockResolvedValue(mockConn),
    newId: vi.fn(),
  };

  const mockStoryboardHistoryRepo = {
    insertHistoryAndPruneInTx: vi.fn().mockResolvedValue(1),
  };

  const mockStoryboardPlanJobRepo = {
    findLatestCompletedByDraftId: vi.fn(),
  };

  return {
    mockConn,
    mockGenDraftRepo,
    mockStoryboardRepo,
    mockStoryboardHistoryRepo,
    mockStoryboardPlanJobRepo,
  };
});

vi.mock('@/repositories/generationDraft.repository.js', () => mockGenDraftRepo);
vi.mock('@/repositories/storyboard.repository.js', () => mockStoryboardRepo);
vi.mock('@/repositories/storyboardHistory.repository.js', () => mockStoryboardHistoryRepo);
vi.mock('@/repositories/storyboardPlanJob.repository.js', () => mockStoryboardPlanJobRepo);

import { ForbiddenError, UnprocessableEntityError } from '@/lib/errors.js';
import { applyLatestCompletedPlan } from './storyboard.service.js';
import { DRAFT_ID, USER_A, USER_B, makeDraft } from './storyboard.service.fixtures.js';

const PLAN: StoryboardPlan = {
  schemaVersion: 1,
  videoLengthSeconds: 12,
  sceneCount: 2,
  scenes: [
    {
      sceneNumber: 1,
      prompt: 'Introduce the problem.',
      visualPrompt: 'Wide shot of a cluttered desk.',
      videoPrompt: 'Animate the scene with natural subject motion and a smooth camera move.',
      durationSeconds: 5.4,
      referencedMedia: [
        {
          fileId: '00000000-0000-4000-8000-000000000001',
          mediaType: 'image',
          label: 'desk.png',
        },
        {
          fileId: '00000000-0000-4000-8000-000000000002',
          mediaType: 'video',
          label: 'workflow.mp4',
        },
      ],
      transitionNotes: '',
      style: 'cinematic',
    },
    {
      sceneNumber: 2,
      prompt: 'Show the resolved state.',
      visualPrompt: 'Clean product hero frame.',
      videoPrompt: 'Animate the scene with natural subject motion and a smooth camera move.',
      durationSeconds: 6.6,
      referencedMedia: [],
      transitionNotes: '',
      style: 'minimal',
    },
  ],
};

function makeCompletedJob(plan: StoryboardPlan | null = PLAN) {
  return {
    jobId: 'job-1',
    draftId: DRAFT_ID,
    userId: USER_A,
    status: 'completed' as const,
    model: null,
    promptSnapshot: {},
    mediaContext: null,
    plan,
    errorMessage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    completedAt: new Date(),
    failedAt: null,
  };
}

describe('storyboard.service — applyLatestCompletedPlan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenDraftRepo.findDraftById.mockResolvedValue(makeDraft(USER_A, 'step2'));
    mockStoryboardPlanJobRepo.findLatestCompletedByDraftId.mockResolvedValue(makeCompletedJob());
    mockStoryboardRepo.findBlocksByDraftId
      .mockResolvedValueOnce([
        { id: 'start-existing', blockType: 'start', sortOrder: 0 },
        { id: 'scene-old', blockType: 'scene', sortOrder: 1 },
        { id: 'end-existing', blockType: 'end', sortOrder: 9999 },
        { id: 'end-duplicate', blockType: 'end', sortOrder: 10000 },
      ])
      .mockResolvedValueOnce([
        { id: 'start-existing', blockType: 'start', mediaItems: [] },
        { id: 'scene-1', blockType: 'scene', mediaItems: [] },
        { id: 'scene-2', blockType: 'scene', mediaItems: [] },
        { id: 'end-existing', blockType: 'end', mediaItems: [] },
      ]);
    mockStoryboardRepo.findEdgesByDraftId.mockResolvedValue([
      { id: 'edge-1', sourceBlockId: 'start-existing', targetBlockId: 'scene-1' },
      { id: 'edge-2', sourceBlockId: 'scene-1', targetBlockId: 'scene-2' },
      { id: 'edge-3', sourceBlockId: 'scene-2', targetBlockId: 'end-existing' },
    ]);
    mockStoryboardRepo.getConnection.mockResolvedValue(mockConn);
    mockStoryboardRepo.newId
      .mockReturnValueOnce('scene-1')
      .mockReturnValueOnce('media-1')
      .mockReturnValueOnce('media-2')
      .mockReturnValueOnce('scene-2')
      .mockReturnValueOnce('edge-1')
      .mockReturnValueOnce('edge-2')
      .mockReturnValueOnce('edge-3');
    mockStoryboardRepo.replaceStoryboard.mockResolvedValue(undefined);
    mockStoryboardHistoryRepo.insertHistoryAndPruneInTx.mockResolvedValue(1);
    mockConn.beginTransaction.mockResolvedValue(undefined);
    mockConn.commit.mockResolvedValue(undefined);
    mockConn.rollback.mockResolvedValue(undefined);
  });

  it('replaces the storyboard with sentinels, ordered scenes, media, edges, and history', async () => {
    const state = await applyLatestCompletedPlan(USER_A, DRAFT_ID);

    expect(state.blocks).toHaveLength(4);
    expect(mockStoryboardRepo.replaceStoryboard).toHaveBeenCalledOnce();
    const [, , blocks, edges] = mockStoryboardRepo.replaceStoryboard.mock.calls[0]!;

    expect(blocks.map((block: { id: string }) => block.id)).toEqual([
      'start-existing',
      'scene-1',
      'scene-2',
      'end-existing',
    ]);
    expect(blocks.map((block: { blockType: string }) => block.blockType)).toEqual([
      'start',
      'scene',
      'scene',
      'end',
    ]);
    expect(blocks[1]).toMatchObject({
      name: 'Scene 01',
      prompt: 'Wide shot of a cluttered desk.',
      videoPrompt: 'Animate the scene with natural subject motion and a smooth camera move.',
      durationS: 5,
      sortOrder: 1,
      style: 'cinematic',
      positionX: 300,
      positionY: 300,
    });
    expect(blocks[2]).toMatchObject({
      name: 'Scene 02',
      prompt: 'Clean product hero frame.',
      videoPrompt: 'Animate the scene with natural subject motion and a smooth camera move.',
      durationS: 7,
      sortOrder: 2,
      style: 'minimal',
      positionX: 550,
      positionY: 300,
    });
    expect(blocks[1].mediaItems).toEqual([
      {
        id: 'media-1',
        fileId: '00000000-0000-4000-8000-000000000001',
        mediaType: 'image',
        sortOrder: 0,
      },
      {
        id: 'media-2',
        fileId: '00000000-0000-4000-8000-000000000002',
        mediaType: 'video',
        sortOrder: 1,
      },
    ]);
    expect(edges).toEqual([
      {
        id: 'edge-1',
        draftId: DRAFT_ID,
        sourceBlockId: 'start-existing',
        targetBlockId: 'scene-1',
      },
      {
        id: 'edge-2',
        draftId: DRAFT_ID,
        sourceBlockId: 'scene-1',
        targetBlockId: 'scene-2',
      },
      {
        id: 'edge-3',
        draftId: DRAFT_ID,
        sourceBlockId: 'scene-2',
        targetBlockId: 'end-existing',
      },
    ]);
    expect(mockStoryboardHistoryRepo.insertHistoryAndPruneInTx).toHaveBeenCalledWith(
      mockConn,
      DRAFT_ID,
      {
        blocks: blocks.map((block: { mediaItems?: unknown[] }) => ({
          ...block,
          mediaItems: block.mediaItems ?? [],
        })),
        edges,
      },
      50,
    );
    expect(mockConn.commit).toHaveBeenCalledOnce();
    expect(mockConn.rollback).not.toHaveBeenCalled();
  });

  it('creates missing sentinels without multiplying existing duplicates', async () => {
    mockStoryboardRepo.findBlocksByDraftId
      .mockReset()
      .mockResolvedValueOnce([{ id: 'start-existing', blockType: 'start', sortOrder: 0 }])
      .mockResolvedValueOnce([]);
    mockStoryboardRepo.newId
      .mockReset()
      .mockReturnValueOnce('scene-1')
      .mockReturnValueOnce('media-1')
      .mockReturnValueOnce('media-2')
      .mockReturnValueOnce('scene-2')
      .mockReturnValueOnce('end-created')
      .mockReturnValueOnce('edge-1')
      .mockReturnValueOnce('edge-2')
      .mockReturnValueOnce('edge-3');

    await applyLatestCompletedPlan(USER_A, DRAFT_ID);

    const [, , blocks] = mockStoryboardRepo.replaceStoryboard.mock.calls[0]!;
    expect(blocks.map((block: { blockType: string }) => block.blockType)).toEqual([
      'start',
      'scene',
      'scene',
      'end',
    ]);
    expect(blocks[0].id).toBe('start-existing');
    expect(blocks[3].id).toBe('end-created');
  });

  it('fails without changing the storyboard when no completed plan exists', async () => {
    mockStoryboardPlanJobRepo.findLatestCompletedByDraftId.mockResolvedValue(null);

    await expect(applyLatestCompletedPlan(USER_A, DRAFT_ID)).rejects.toThrow(
      UnprocessableEntityError,
    );

    expect(mockStoryboardRepo.replaceStoryboard).not.toHaveBeenCalled();
    expect(mockStoryboardHistoryRepo.insertHistoryAndPruneInTx).not.toHaveBeenCalled();
  });

  it('fails without changing the storyboard when the draft belongs to another user', async () => {
    mockGenDraftRepo.findDraftById.mockResolvedValue(makeDraft(USER_B, 'step2'));

    await expect(applyLatestCompletedPlan(USER_A, DRAFT_ID)).rejects.toThrow(ForbiddenError);

    expect(mockStoryboardPlanJobRepo.findLatestCompletedByDraftId).not.toHaveBeenCalled();
    expect(mockStoryboardRepo.replaceStoryboard).not.toHaveBeenCalled();
  });

  it('rolls back when replacement or history insertion fails', async () => {
    mockStoryboardHistoryRepo.insertHistoryAndPruneInTx.mockRejectedValue(new Error('history failed'));

    await expect(applyLatestCompletedPlan(USER_A, DRAFT_ID)).rejects.toThrow('history failed');

    expect(mockConn.rollback).toHaveBeenCalledOnce();
    expect(mockConn.commit).not.toHaveBeenCalled();
    expect(mockConn.release).toHaveBeenCalledOnce();
  });
});
