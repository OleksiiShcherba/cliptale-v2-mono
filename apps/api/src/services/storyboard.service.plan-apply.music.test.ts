import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { StoryboardPlan } from '@ai-video-editor/project-schema';

const {
  mockConn,
  mockGenDraftRepo,
  mockStoryboardRepo,
  mockStoryboardMusicRepo,
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

  const mockStoryboardMusicRepo = {
    listMusicBlocksByDraftId: vi.fn().mockResolvedValue([]),
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
    mockStoryboardMusicRepo,
    mockStoryboardHistoryRepo,
    mockStoryboardPlanJobRepo,
  };
});

vi.mock('@/repositories/generationDraft.repository.js', () => mockGenDraftRepo);
vi.mock('@/repositories/storyboard.repository.js', () => mockStoryboardRepo);
vi.mock('@/repositories/storyboardMusic.repository.js', () => mockStoryboardMusicRepo);
vi.mock('@/repositories/storyboardHistory.repository.js', () => mockStoryboardHistoryRepo);
vi.mock('@/repositories/storyboardPlanJob.repository.js', () => mockStoryboardPlanJobRepo);

import { UnprocessableEntityError } from '@/lib/errors.js';

import { applyLatestCompletedPlan } from './storyboard.service.js';
import {
  DRAFT_ID,
  MUSIC_COMPOSITION_PLAN,
  STORYBOARD_PLAN,
  USER_A,
  makeCompletedPlanJob,
  makeDraft,
} from './storyboard.service.fixtures.js';

describe('storyboard.service — applyLatestCompletedPlan music layout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenDraftRepo.findDraftById.mockResolvedValue(makeDraft(USER_A, 'step2'));
    mockStoryboardPlanJobRepo.findLatestCompletedByDraftId.mockResolvedValue(makeCompletedPlanJob());
    mockStoryboardRepo.findBlocksByDraftId
      .mockResolvedValueOnce([
        { id: 'start-existing', blockType: 'start', sortOrder: 0 },
        { id: 'scene-old', blockType: 'scene', sortOrder: 1 },
        { id: 'end-existing', blockType: 'end', sortOrder: 9999 },
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
    mockStoryboardMusicRepo.listMusicBlocksByDraftId.mockResolvedValue([]);
    mockStoryboardHistoryRepo.insertHistoryAndPruneInTx.mockResolvedValue(1);
    mockConn.beginTransaction.mockResolvedValue(undefined);
    mockConn.commit.mockResolvedValue(undefined);
    mockConn.rollback.mockResolvedValue(undefined);
  });

  it('creates stacked music blocks from plan ranges and includes them in history', async () => {
    const planWithMusic = {
      ...STORYBOARD_PLAN,
      schemaVersion: 2,
      musicSegments: [
        {
          name: 'Launch momentum',
          prompt: 'Warm instrumental bed that follows the full launch story.',
          compositionPlan: MUSIC_COMPOSITION_PLAN,
          startSceneNumber: 1,
          endSceneNumber: 2,
          sourceMode: 'generate_on_step3',
        },
        {
          name: 'Product lift',
          prompt: 'Brighter cue for the resolved product moment.',
          compositionPlan: MUSIC_COMPOSITION_PLAN,
          startSceneNumber: 2,
          endSceneNumber: 2,
          sourceMode: 'generate_on_step3',
        },
      ],
    } as StoryboardPlan;
    mockStoryboardPlanJobRepo.findLatestCompletedByDraftId.mockResolvedValue(
      makeCompletedPlanJob(planWithMusic),
    );
    mockStoryboardRepo.newId
      .mockReset()
      .mockReturnValueOnce('scene-1')
      .mockReturnValueOnce('media-1')
      .mockReturnValueOnce('media-2')
      .mockReturnValueOnce('scene-2')
      .mockReturnValueOnce('edge-1')
      .mockReturnValueOnce('edge-2')
      .mockReturnValueOnce('edge-3')
      .mockReturnValueOnce('music-1')
      .mockReturnValueOnce('music-2');
    mockStoryboardMusicRepo.listMusicBlocksByDraftId.mockResolvedValue([
      {
        id: 'music-1',
        draftId: DRAFT_ID,
        name: 'Music 01 - Launch momentum',
        sourceMode: 'generate_on_step3',
        prompt: 'Warm instrumental bed that follows the full launch story.',
        compositionPlan: MUSIC_COMPOSITION_PLAN,
        existingFileId: null,
        startSceneBlockId: 'scene-1',
        endSceneBlockId: 'scene-2',
        positionX: 300,
        positionY: 620,
        sortOrder: 0,
        volume: 0.8,
        fadeInS: 0,
        fadeOutS: 1,
        loopMode: 'trim',
        generationStatus: null,
        generationJobId: null,
        outputFileId: null,
        errorMessage: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'music-2',
        draftId: DRAFT_ID,
        name: 'Music 02 - Product lift',
        sourceMode: 'generate_on_step3',
        prompt: 'Brighter cue for the resolved product moment.',
        compositionPlan: MUSIC_COMPOSITION_PLAN,
        existingFileId: null,
        startSceneBlockId: 'scene-2',
        endSceneBlockId: 'scene-2',
        positionX: 552,
        positionY: 752,
        sortOrder: 1,
        volume: 0.8,
        fadeInS: 0,
        fadeOutS: 1,
        loopMode: 'trim',
        generationStatus: null,
        generationJobId: null,
        outputFileId: null,
        errorMessage: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const state = await applyLatestCompletedPlan(USER_A, DRAFT_ID);

    expect(state.musicBlocks).toHaveLength(2);
    const [, , blocks, edges, musicBlocks] = mockStoryboardRepo.replaceStoryboard.mock.calls[0]!;
    expect(musicBlocks).toEqual([
      {
        id: 'music-1',
        draftId: DRAFT_ID,
        name: 'Music 01 - Launch momentum',
        sourceMode: 'generate_on_step3',
        prompt: 'Warm instrumental bed that follows the full launch story.',
        compositionPlan: MUSIC_COMPOSITION_PLAN,
        existingFileId: null,
        startSceneBlockId: 'scene-1',
        endSceneBlockId: 'scene-2',
        positionX: 300,
        positionY: 620,
        sortOrder: 0,
        volume: 0.8,
        fadeInS: 0,
        fadeOutS: 1,
        loopMode: 'trim',
      },
      {
        id: 'music-2',
        draftId: DRAFT_ID,
        name: 'Music 02 - Product lift',
        sourceMode: 'generate_on_step3',
        prompt: 'Brighter cue for the resolved product moment.',
        compositionPlan: MUSIC_COMPOSITION_PLAN,
        existingFileId: null,
        startSceneBlockId: 'scene-2',
        endSceneBlockId: 'scene-2',
        positionX: 552,
        positionY: 752,
        sortOrder: 1,
        volume: 0.8,
        fadeInS: 0,
        fadeOutS: 1,
        loopMode: 'trim',
      },
    ]);
    expect(musicBlocks[0]!.positionY).toBeGreaterThan(blocks[1]!.positionY);
    expect(musicBlocks[1]!.positionY - musicBlocks[0]!.positionY).toBe(132);
    expect(mockStoryboardHistoryRepo.insertHistoryAndPruneInTx).toHaveBeenCalledWith(
      mockConn,
      DRAFT_ID,
      {
        blocks: blocks.map((block: { mediaItems?: unknown[] }) => ({
          ...block,
          mediaItems: block.mediaItems ?? [],
        })),
        edges,
        musicBlocks,
      },
      50,
    );
  });

  it('fails before replacing the storyboard when a music segment references an invalid scene range', async () => {
    const invalidPlan = {
      ...STORYBOARD_PLAN,
      schemaVersion: 2,
      musicSegments: [
        {
          name: 'Invalid range',
          prompt: 'Instrumental bed.',
          compositionPlan: MUSIC_COMPOSITION_PLAN,
          startSceneNumber: 1,
          endSceneNumber: 3,
          sourceMode: 'generate_on_step3',
        },
      ],
    } as StoryboardPlan;
    mockStoryboardPlanJobRepo.findLatestCompletedByDraftId.mockResolvedValue(
      makeCompletedPlanJob(invalidPlan),
    );

    await expect(applyLatestCompletedPlan(USER_A, DRAFT_ID)).rejects.toThrow(
      UnprocessableEntityError,
    );

    expect(mockStoryboardRepo.getConnection).not.toHaveBeenCalled();
    expect(mockStoryboardRepo.replaceStoryboard).not.toHaveBeenCalled();
    expect(mockStoryboardHistoryRepo.insertHistoryAndPruneInTx).not.toHaveBeenCalled();
  });
});
