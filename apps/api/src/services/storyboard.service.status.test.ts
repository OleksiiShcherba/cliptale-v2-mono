/**
 * Unit tests for storyboard.service.ts — initializeStoryboard status advancement
 *
 * Covers the idempotent status guard added to initializeStoryboard:
 *  - advances draft from 'draft' → 'step2' via updateDraftStatus
 *  - does NOT advance when status is already 'step2', 'step3', or 'completed'
 *  - still returns the correct { blocks, edges } response after advancement
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
    updateDraftStatus: vi.fn().mockResolvedValue(undefined),
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

// ── Fixtures ──────────────────────────────────────────────────────────────────

import { USER_A, DRAFT_ID, makeDraft } from './storyboard.service.fixtures.js';

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockStoryboardRepo.countBlocksByType.mockResolvedValue(0);
  mockStoryboardRepo.findBlocksByDraftId.mockResolvedValue([]);
  mockStoryboardRepo.findEdgesByDraftId.mockResolvedValue([]);
  mockStoryboardRepo.getConnection.mockResolvedValue(mockConn);
  mockGenDraftRepo.updateDraftStatus.mockResolvedValue(undefined);
  mockConn.beginTransaction.mockResolvedValue(undefined);
  mockConn.commit.mockResolvedValue(undefined);
  mockConn.rollback.mockResolvedValue(undefined);
});

// ── initializeStoryboard — draft status advancement ───────────────────────────

describe('storyboard.service — initializeStoryboard status advancement', () => {
  it("calls updateDraftStatus with 'step2' when draft status is 'draft'", async () => {
    mockGenDraftRepo.findDraftById.mockResolvedValue(makeDraft(USER_A, 'draft'));

    await storyboardService.initializeStoryboard(USER_A, DRAFT_ID);

    expect(mockGenDraftRepo.updateDraftStatus).toHaveBeenCalledOnce();
    expect(mockGenDraftRepo.updateDraftStatus).toHaveBeenCalledWith(DRAFT_ID, 'step2');
  });

  it("does NOT call updateDraftStatus when draft status is already 'step2'", async () => {
    mockGenDraftRepo.findDraftById.mockResolvedValue(makeDraft(USER_A, 'step2'));

    await storyboardService.initializeStoryboard(USER_A, DRAFT_ID);

    expect(mockGenDraftRepo.updateDraftStatus).not.toHaveBeenCalled();
  });

  it("does NOT call updateDraftStatus when draft status is 'step3'", async () => {
    mockGenDraftRepo.findDraftById.mockResolvedValue(makeDraft(USER_A, 'step3'));

    await storyboardService.initializeStoryboard(USER_A, DRAFT_ID);

    expect(mockGenDraftRepo.updateDraftStatus).not.toHaveBeenCalled();
  });

  it("does NOT call updateDraftStatus when draft status is 'completed'", async () => {
    mockGenDraftRepo.findDraftById.mockResolvedValue(makeDraft(USER_A, 'completed'));

    await storyboardService.initializeStoryboard(USER_A, DRAFT_ID);

    expect(mockGenDraftRepo.updateDraftStatus).not.toHaveBeenCalled();
  });

  it('still returns the correct { blocks, edges } response after status advancement', async () => {
    mockGenDraftRepo.findDraftById.mockResolvedValue(makeDraft(USER_A, 'draft'));
    const expectedBlocks = [{ id: 'b1', blockType: 'start', mediaItems: [] }];
    mockStoryboardRepo.findBlocksByDraftId.mockResolvedValue(expectedBlocks);
    mockStoryboardRepo.findEdgesByDraftId.mockResolvedValue([]);

    const result = await storyboardService.initializeStoryboard(USER_A, DRAFT_ID);

    expect(result.blocks).toEqual(expectedBlocks);
    expect(result.edges).toEqual([]);
  });
});
