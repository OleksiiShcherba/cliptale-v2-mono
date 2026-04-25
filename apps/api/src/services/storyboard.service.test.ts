/**
 * Unit tests for storyboard.service.ts
 *
 * All repository calls are mocked so the DB is never touched.
 *
 * Coverage:
 *  - assertOwnership: NotFoundError when draft is absent
 *  - assertOwnership: ForbiddenError when userId differs
 *  - initializeStoryboard: idempotent when START+END already exist
 *  - initializeStoryboard: inserts both sentinel blocks on first call
 *  - pushHistory: delegates to repository with HISTORY_CAP (50)
 *  - listHistory: delegates to repository
 *  - saveStoryboard: commits on success; rollback called on failure
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock hoisted values ───────────────────────────────────────────────────────

const { mockPool, mockConn, mockGenDraftRepo, mockStoryboardRepo } = vi.hoisted(() => {
  const mockConn = {
    beginTransaction: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
    release: vi.fn(),
    execute: vi.fn().mockResolvedValue([[{ cnt: 0 }], []]),
  };

  const mockPool = {
    execute: vi.fn().mockResolvedValue([[], []]),
    getConnection: vi.fn().mockResolvedValue(mockConn),
  };

  const mockGenDraftRepo = {
    findDraftById: vi.fn(),
  };

  const mockStoryboardRepo = {
    findBlocksByDraftId: vi.fn().mockResolvedValue([]),
    findEdgesByDraftId: vi.fn().mockResolvedValue([]),
    countBlocksByType: vi.fn().mockResolvedValue(0),
    insertBlock: vi.fn().mockResolvedValue(undefined),
    insertSentinelsInTx: vi.fn().mockResolvedValue(undefined),
    replaceStoryboard: vi.fn().mockResolvedValue(undefined),
    insertHistoryAndPrune: vi.fn().mockResolvedValue(1),
    findHistoryByDraftId: vi.fn().mockResolvedValue([]),
    getConnection: vi.fn().mockResolvedValue(mockConn),
    newId: vi.fn().mockReturnValue('00000000-0000-0000-0000-000000000001'),
  };

  return { mockPool, mockConn, mockGenDraftRepo, mockStoryboardRepo };
});

vi.mock('@/db/connection.js', () => ({ pool: mockPool }));
vi.mock('@/repositories/generationDraft.repository.js', () => mockGenDraftRepo);
vi.mock('@/repositories/storyboard.repository.js', () => mockStoryboardRepo);

// ── Import service under test after mocks are in place ────────────────────────

import * as storyboardService from './storyboard.service.js';
import { ForbiddenError, NotFoundError } from '@/lib/errors.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const USER_A = 'user-aaa';
const USER_B = 'user-bbb';
const DRAFT_ID = 'draft-111';

function makeDraft(userId: string) {
  return {
    id: DRAFT_ID,
    userId,
    promptDoc: {},
    status: 'draft',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Restore sensible defaults after each test.
  mockStoryboardRepo.countBlocksByType.mockResolvedValue(0);
  mockStoryboardRepo.findBlocksByDraftId.mockResolvedValue([]);
  mockStoryboardRepo.findEdgesByDraftId.mockResolvedValue([]);
  mockStoryboardRepo.insertHistoryAndPrune.mockResolvedValue(1);
  mockStoryboardRepo.findHistoryByDraftId.mockResolvedValue([]);
  mockStoryboardRepo.getConnection.mockResolvedValue(mockConn);
  mockConn.beginTransaction.mockResolvedValue(undefined);
  mockConn.commit.mockResolvedValue(undefined);
  mockConn.rollback.mockResolvedValue(undefined);
});

// ── assertOwnership ───────────────────────────────────────────────────────────

describe('storyboard.service — ownership enforcement', () => {
  it('throws NotFoundError when the draft does not exist', async () => {
    mockGenDraftRepo.findDraftById.mockResolvedValue(null);

    await expect(
      storyboardService.loadStoryboard(USER_A, DRAFT_ID),
    ).rejects.toThrow(NotFoundError);
  });

  it('throws ForbiddenError when the draft belongs to a different user', async () => {
    mockGenDraftRepo.findDraftById.mockResolvedValue(makeDraft(USER_B));

    await expect(
      storyboardService.loadStoryboard(USER_A, DRAFT_ID),
    ).rejects.toThrow(ForbiddenError);
  });

  it('does not throw when the draft belongs to the requesting user', async () => {
    mockGenDraftRepo.findDraftById.mockResolvedValue(makeDraft(USER_A));

    await expect(
      storyboardService.loadStoryboard(USER_A, DRAFT_ID),
    ).resolves.not.toThrow();
  });
});

// ── initializeStoryboard ──────────────────────────────────────────────────────

describe('storyboard.service — initializeStoryboard', () => {
  beforeEach(() => {
    mockGenDraftRepo.findDraftById.mockResolvedValue(makeDraft(USER_A));
  });

  it('does not insert blocks when START and END already exist', async () => {
    mockStoryboardRepo.countBlocksByType.mockResolvedValue(1);

    await storyboardService.initializeStoryboard(USER_A, DRAFT_ID);

    expect(mockStoryboardRepo.insertBlock).not.toHaveBeenCalled();
  });

  it('inserts START and END blocks when neither exists', async () => {
    mockStoryboardRepo.countBlocksByType.mockResolvedValue(0);
    mockStoryboardRepo.newId
      .mockReturnValueOnce('block-start-id')
      .mockReturnValueOnce('block-end-id');

    await storyboardService.initializeStoryboard(USER_A, DRAFT_ID);

    expect(mockStoryboardRepo.insertBlock).toHaveBeenCalledTimes(2);

    const [startCall, endCall] = mockStoryboardRepo.insertBlock.mock.calls as [
      [Parameters<typeof mockStoryboardRepo.insertBlock>[0]],
      [Parameters<typeof mockStoryboardRepo.insertBlock>[0]],
    ];
    expect(startCall[0].blockType).toBe('start');
    expect(startCall[0].positionX).toBe(50);
    expect(startCall[0].positionY).toBe(300);
    expect(endCall[0].blockType).toBe('end');
    expect(endCall[0].positionX).toBe(900);
    expect(endCall[0].positionY).toBe(300);
  });

  it('returns current state unchanged when already initialised (idempotency)', async () => {
    mockStoryboardRepo.countBlocksByType.mockResolvedValue(1);

    const existing = [
      { id: 'b1', blockType: 'start', mediaItems: [] },
      { id: 'b2', blockType: 'end', mediaItems: [] },
    ];
    mockStoryboardRepo.findBlocksByDraftId.mockResolvedValue(existing);
    mockStoryboardRepo.findEdgesByDraftId.mockResolvedValue([]);

    const result = await storyboardService.initializeStoryboard(USER_A, DRAFT_ID);

    expect(result.blocks).toEqual(existing);
    expect(result.edges).toEqual([]);
  });
});

// ── pushHistory (HISTORY_CAP enforcement) ────────────────────────────────────

describe('storyboard.service — pushHistory', () => {
  beforeEach(() => {
    mockGenDraftRepo.findDraftById.mockResolvedValue(makeDraft(USER_A));
  });

  it('calls insertHistoryAndPrune with keepCount=50', async () => {
    const snapshot = { blocks: [], edges: [] };

    await storyboardService.pushHistory(USER_A, DRAFT_ID, snapshot);

    expect(mockStoryboardRepo.insertHistoryAndPrune).toHaveBeenCalledWith(
      DRAFT_ID,
      snapshot,
      50,
    );
  });

  it('returns the id assigned by the repository', async () => {
    mockStoryboardRepo.insertHistoryAndPrune.mockResolvedValue(42);

    const id = await storyboardService.pushHistory(USER_A, DRAFT_ID, {});
    expect(id).toBe(42);
  });
});

// ── listHistory ───────────────────────────────────────────────────────────────

describe('storyboard.service — listHistory', () => {
  beforeEach(() => {
    mockGenDraftRepo.findDraftById.mockResolvedValue(makeDraft(USER_A));
  });

  it('delegates to findHistoryByDraftId with limit=50', async () => {
    await storyboardService.listHistory(USER_A, DRAFT_ID);

    expect(mockStoryboardRepo.findHistoryByDraftId).toHaveBeenCalledWith(DRAFT_ID, 50);
  });

  it('returns the array provided by the repository', async () => {
    const entries = [{ id: 1, snapshot: {}, createdAt: new Date() }];
    mockStoryboardRepo.findHistoryByDraftId.mockResolvedValue(entries);

    const result = await storyboardService.listHistory(USER_A, DRAFT_ID);
    expect(result).toEqual(entries);
  });
});

// ── saveStoryboard (transaction) ──────────────────────────────────────────────

describe('storyboard.service — saveStoryboard', () => {
  beforeEach(() => {
    mockGenDraftRepo.findDraftById.mockResolvedValue(makeDraft(USER_A));
  });

  it('commits on success', async () => {
    await storyboardService.saveStoryboard(USER_A, DRAFT_ID, [], []);

    expect(mockConn.beginTransaction).toHaveBeenCalledOnce();
    expect(mockConn.commit).toHaveBeenCalledOnce();
    expect(mockConn.rollback).not.toHaveBeenCalled();
    expect(mockConn.release).toHaveBeenCalledOnce();
  });

  it('rolls back and re-throws when replaceStoryboard fails', async () => {
    const boom = new Error('DB exploded');
    mockStoryboardRepo.replaceStoryboard.mockRejectedValue(boom);

    await expect(
      storyboardService.saveStoryboard(USER_A, DRAFT_ID, [], []),
    ).rejects.toThrow('DB exploded');

    expect(mockConn.rollback).toHaveBeenCalledOnce();
    expect(mockConn.commit).not.toHaveBeenCalled();
    expect(mockConn.release).toHaveBeenCalledOnce();
  });
});
