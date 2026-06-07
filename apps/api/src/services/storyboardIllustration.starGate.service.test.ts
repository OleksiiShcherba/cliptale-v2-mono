/**
 * T10 — Star gate in storyboardIllustration.service (unit tests)
 *
 * ACs under test:
 *   AC-04  — failed block with no results counts as missing a star; gate message
 *            names it together with exit actions (retry / delete).
 *   AC-08  — full-set generation is blocked while any reference block lacks a star;
 *            the message names exactly which blocks are missing (ADR-0011).
 *   AC-08b — regenerating scene X needs stars only from blocks linked to X; an
 *            unstarred block not linked to X does NOT block it; zero reference
 *            blocks → gate passes.
 *
 * Level: unit (vi.mock — no I/O, per test-plan.md).
 *
 * Run:
 *   cd apps/api && APP_DB_PASSWORD=cliptale APP_REDIS_URL=redis://localhost:6380 \
 *     npx vitest run src/services/storyboardIllustration.starGate.service.test.ts
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Hoisted mocks ──────────────────────────────────────────────────────────────
// All mocks must be declared before any app imports (Vitest hoisting rule).

const {
  mockDraftRepo,
  mockStoryboardRepo,
  mockStoryboardPlanJobRepo,
  mockIllustrationRepo,
  mockPrincipalReferenceRepo,
  mockReferenceBlocksRepo,
  mockReferenceStarGateRepo,
  mockStoryboardOpenAIQueue,
  mockAiJobRepo,
  mockFileLinksRepo,
} = vi.hoisted(() => ({
  mockDraftRepo: { findDraftById: vi.fn() },
  mockStoryboardRepo: { findBlocksByDraftId: vi.fn(), findEdgesByDraftId: vi.fn() },
  mockStoryboardPlanJobRepo: { findLatestByDraftId: vi.fn() },
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
  // Existing principal-image repo (storyboardIllustrationReference.repository.js)
  mockPrincipalReferenceRepo: {
    approveReference: vi.fn(),
    createReferenceMapping: vi.fn(),
    deactivateActiveReference: vi.fn(),
    findLatestReferenceByDraftId: vi.fn(),
    setReferenceOutput: vi.fn(),
    toStoryboardIllustrationReferenceStatus: vi.fn((status: string) => {
      if (status === 'processing') return 'running';
      if (status === 'completed') return 'ready';
      return status;
    }),
    updateSourceReferenceFileIds: vi.fn(),
    updateReferenceStatus: vi.fn(),
  },
  // New reference-blocks repo (storyboardReference.repository.js — T2/T3)
  mockReferenceBlocksRepo: {
    listReferenceBlocksByDraftId: vi.fn(),
  },
  // New curation repo — star gate reads (storyboardReferenceCuration.repository.js — T3)
  mockReferenceStarGateRepo: {
    listStarsForBlock: vi.fn(),
    listReferenceBlocksLinkedToScene: vi.fn(),
  },
  mockStoryboardOpenAIQueue: { enqueueStoryboardOpenAIImage: vi.fn() },
  mockAiJobRepo: {
    createJob: vi.fn(),
    getJobById: vi.fn(),
    setDraftId: vi.fn(),
    setOutputFile: vi.fn(),
    updateJobStatus: vi.fn(),
  },
  mockFileLinksRepo: { findFilesByDraftId: vi.fn() },
}));

vi.mock('@/repositories/generationDraft.repository.js', () => mockDraftRepo);
vi.mock('@/repositories/storyboard.repository.js', () => mockStoryboardRepo);
vi.mock('@/repositories/storyboardPlanJob.repository.js', () => mockStoryboardPlanJobRepo);
vi.mock('@/repositories/storyboardSceneIllustration.repository.js', () => mockIllustrationRepo);
vi.mock('@/repositories/storyboardIllustrationReference.repository.js', () => mockPrincipalReferenceRepo);
vi.mock('@/repositories/storyboardReference.repository.js', () => mockReferenceBlocksRepo);
vi.mock('@/repositories/storyboardReferenceCuration.repository.js', () => mockReferenceStarGateRepo);
vi.mock('@/queues/jobs/enqueue-storyboard-openai-image.js', () => mockStoryboardOpenAIQueue);
vi.mock('@/repositories/aiGenerationJob.repository.js', () => mockAiJobRepo);
vi.mock('@/repositories/fileLinks.repository.js', () => mockFileLinksRepo);

// ── App imports (after mocks) ──────────────────────────────────────────────────
import { UnprocessableEntityError } from '@/lib/errors.js';
import type { StoryboardBlock, StoryboardEdge } from '@/repositories/storyboard.repository.js';
import {
  startStoryboardIllustrations,
  startStoryboardBlockIllustration,
} from './storyboardIllustration.service.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

const USER_ID = 'user-gate-1';
const DRAFT_ID = 'draft-gate-1';

function makeDraft(overrides: Record<string, unknown> = {}) {
  return {
    id: DRAFT_ID,
    userId: USER_ID,
    promptDoc: {
      schemaVersion: 1,
      blocks: [{ type: 'text', value: 'Story prompt' }],
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

function makeSceneBlock(id: string, sortOrder = 1): StoryboardBlock {
  return {
    id,
    draftId: DRAFT_ID,
    blockType: 'scene',
    name: `Scene ${sortOrder}`,
    prompt: 'A bright scene.',
    durationS: 5,
    positionX: 0,
    positionY: 0,
    sortOrder,
    style: 'cinematic',
    createdAt: new Date(),
    updatedAt: new Date(),
    mediaItems: [],
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

/** A reference block record as returned by listReferenceBlocksByDraftId */
function makeReferenceBlock(id: string, name: string, sortOrder = 0) {
  return {
    id,
    draftId: DRAFT_ID,
    flowId: `flow-${id}`,
    castType: 'character' as const,
    name,
    description: null,
    sortOrder,
    positionX: 0,
    positionY: 0,
    windowStatus: 'done' as const,
    firstJobId: null,
    errorMessage: null,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/** A minimal star record as returned by listStarsForBlock */
function makeStar(referenceBlockId: string, fileId: string, isPrimary = true) {
  return {
    id: `star-${fileId}`,
    referenceBlockId,
    fileId,
    isPrimary,
  };
}

/** A ready principal reference (principal-image, the old mechanism, now satisfied) */
function makePrincipalReference(overrides: Record<string, unknown> = {}) {
  return {
    id: 'principal-ref-1',
    draftId: DRAFT_ID,
    aiJobId: 'principal-job-1',
    status: 'ready',
    outputFileId: 'principal-file-1',
    sourceReferenceFileIds: [],
    approvalStatus: 'approved',
    approvedAt: new Date(),
    errorMessage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('storyboardIllustration.service — star gate (AC-08, AC-08b, AC-04)', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Baseline: valid owner, one scene block, no edges, no prior mappings
    mockDraftRepo.findDraftById.mockResolvedValue(makeDraft());
    mockStoryboardRepo.findBlocksByDraftId.mockResolvedValue([makeSceneBlock('scene-1')]);
    mockStoryboardRepo.findEdgesByDraftId.mockResolvedValue([]);
    mockStoryboardPlanJobRepo.findLatestByDraftId.mockResolvedValue(null);
    mockIllustrationRepo.findLatestIllustrationJobsByDraftId.mockResolvedValue([]);
    mockAiJobRepo.createJob.mockResolvedValue(undefined);
    mockAiJobRepo.setDraftId.mockResolvedValue(undefined);
    mockAiJobRepo.setOutputFile.mockResolvedValue(undefined);
    mockAiJobRepo.updateJobStatus.mockResolvedValue(undefined);
    mockAiJobRepo.getJobById.mockResolvedValue(null);
    mockFileLinksRepo.findFilesByDraftId.mockResolvedValue([]);
    mockIllustrationRepo.createIllustrationJobMapping.mockResolvedValue(true);
    mockIllustrationRepo.attachIllustrationOutputToBlock.mockResolvedValue(undefined);
    mockIllustrationRepo.setIllustrationJobOutput.mockResolvedValue(undefined);
    mockIllustrationRepo.updateIllustrationJobStatus.mockResolvedValue(undefined);

    // Principal reference is ready and approved by default
    mockPrincipalReferenceRepo.findLatestReferenceByDraftId.mockResolvedValue(makePrincipalReference());
    mockPrincipalReferenceRepo.approveReference.mockResolvedValue(true);
    mockPrincipalReferenceRepo.createReferenceMapping.mockResolvedValue(true);
    mockPrincipalReferenceRepo.deactivateActiveReference.mockResolvedValue(undefined);
    mockPrincipalReferenceRepo.setReferenceOutput.mockResolvedValue(undefined);
    mockPrincipalReferenceRepo.updateSourceReferenceFileIds.mockResolvedValue(true);
    mockPrincipalReferenceRepo.updateReferenceStatus.mockResolvedValue(undefined);
    mockStoryboardOpenAIQueue.enqueueStoryboardOpenAIImage.mockResolvedValue(undefined);

    // Default: no reference blocks (zero-block case passes the gate)
    mockReferenceBlocksRepo.listReferenceBlocksByDraftId.mockResolvedValue([]);
    mockReferenceStarGateRepo.listStarsForBlock.mockResolvedValue([]);
    mockReferenceStarGateRepo.listReferenceBlocksLinkedToScene.mockResolvedValue([]);
  });

  // ── AC-08 — full-set gate ──────────────────────────────────────────────────

  it('AC-08: blocks full-set start when 1 of 3 reference blocks lacks a starred result, and names exactly that block', async () => {
    const blocksA = makeReferenceBlock('ref-block-A', 'Test Character A', 0);
    const blocksB = makeReferenceBlock('ref-block-B', 'Test Character B', 1);
    const blocksC = makeReferenceBlock('ref-block-C', 'Test Character C', 2);

    mockReferenceBlocksRepo.listReferenceBlocksByDraftId.mockResolvedValue([
      blocksA,
      blocksB,
      blocksC,
    ]);

    // A and C have stars; B does not
    mockReferenceStarGateRepo.listStarsForBlock.mockImplementation(async (blockId: string) => {
      if (blockId === 'ref-block-A') return [makeStar('ref-block-A', 'file-A')];
      if (blockId === 'ref-block-C') return [makeStar('ref-block-C', 'file-C')];
      return []; // B has no stars
    });

    await expect(startStoryboardIllustrations(USER_ID, DRAFT_ID)).rejects.toThrow(
      UnprocessableEntityError,
    );

    const error = await startStoryboardIllustrations(USER_ID, DRAFT_ID).catch((e) => e);
    expect(error).toBeInstanceOf(UnprocessableEntityError);
    // The message must name the exact block without a star (AC-08 "names exactly which blocks")
    expect(error.message).toContain('Test Character B');
    // Must NOT mention the blocks that are fine
    expect(error.message).not.toContain('Test Character A');
    expect(error.message).not.toContain('Test Character C');
  });

  it('AC-08: allows full-set start when all reference blocks have at least one star', async () => {
    const blockA = makeReferenceBlock('ref-block-A', 'Test Character A', 0);
    const blockB = makeReferenceBlock('ref-block-B', 'Test Environment B', 1);

    mockReferenceBlocksRepo.listReferenceBlocksByDraftId.mockResolvedValue([blockA, blockB]);
    mockReferenceStarGateRepo.listStarsForBlock.mockImplementation(async (blockId: string) => {
      return [makeStar(blockId, `file-${blockId}`)];
    });

    // Should not throw — star gate passes, generation proceeds
    await expect(startStoryboardIllustrations(USER_ID, DRAFT_ID)).resolves.toBeDefined();
    // Verify the gate checked stars for all blocks
    expect(mockReferenceStarGateRepo.listStarsForBlock).toHaveBeenCalledWith('ref-block-A');
    expect(mockReferenceStarGateRepo.listStarsForBlock).toHaveBeenCalledWith('ref-block-B');
  });

  it('AC-08b (zero blocks): a draft with no reference blocks passes the star gate', async () => {
    // Default mock already returns [] for listReferenceBlocksByDraftId
    mockReferenceBlocksRepo.listReferenceBlocksByDraftId.mockResolvedValue([]);

    // Should not throw — zero-block case passes (AC-08b, AC-09 no-linked-blocks rule)
    await expect(startStoryboardIllustrations(USER_ID, DRAFT_ID)).resolves.toBeDefined();
    // The gate MUST consult the reference blocks list (it reads zero and passes)
    expect(mockReferenceBlocksRepo.listReferenceBlocksByDraftId).toHaveBeenCalledWith(
      expect.objectContaining({ draftId: DRAFT_ID }),
    );
    // With zero blocks there are no stars to check
    expect(mockReferenceStarGateRepo.listStarsForBlock).not.toHaveBeenCalled();
  });

  // ── AC-08b — scoped gate (per-scene) ──────────────────────────────────────

  it('AC-08b: regenerating scene X is blocked only by unstarred blocks linked to X, not unlinked ones', async () => {
    const linkedBlock = makeReferenceBlock('ref-linked', 'Linked Character', 0);
    const unlinkedBlock = makeReferenceBlock('ref-unlinked', 'Unlinked Character', 1);

    // Two reference blocks exist; only 'ref-linked' is linked to scene-1
    mockReferenceBlocksRepo.listReferenceBlocksByDraftId.mockResolvedValue([
      linkedBlock,
      unlinkedBlock,
    ]);

    // Scene-scoped query: only 'ref-linked' is linked to 'scene-1'
    mockReferenceStarGateRepo.listReferenceBlocksLinkedToScene.mockResolvedValue([linkedBlock]);

    // linked block has NO star; unlinked block has a star (but is irrelevant)
    mockReferenceStarGateRepo.listStarsForBlock.mockImplementation(async (blockId: string) => {
      if (blockId === 'ref-unlinked') return [makeStar('ref-unlinked', 'file-unlinked')];
      return []; // linked block has no star
    });

    // Should throw because the linked block lacks a star
    const error = await startStoryboardBlockIllustration(USER_ID, DRAFT_ID, 'scene-1').catch((e) => e);
    expect(error).toBeInstanceOf(UnprocessableEntityError);
    // Must name the linked unstarred block
    expect(error.message).toContain('Linked Character');
    // Must NOT mention the unlinked block (even though it's in the draft)
    expect(error.message).not.toContain('Unlinked Character');
  });

  it('AC-08b: regenerating scene X passes the gate when all blocks linked to X have stars', async () => {
    const linkedBlock = makeReferenceBlock('ref-linked', 'Linked Character', 0);
    const unlinkedUnstarred = makeReferenceBlock('ref-unlinked', 'Unlinked Unstarred', 1);

    mockReferenceBlocksRepo.listReferenceBlocksByDraftId.mockResolvedValue([
      linkedBlock,
      unlinkedUnstarred,
    ]);

    // Only 'ref-linked' is linked to 'scene-1'
    mockReferenceStarGateRepo.listReferenceBlocksLinkedToScene.mockResolvedValue([linkedBlock]);

    // linked block HAS a star; unlinked is unstarred but should not block
    mockReferenceStarGateRepo.listStarsForBlock.mockImplementation(async (blockId: string) => {
      if (blockId === 'ref-linked') return [makeStar('ref-linked', 'file-linked')];
      return [];
    });

    // Should not throw — linked block is starred, unlinked block is irrelevant
    await expect(startStoryboardBlockIllustration(USER_ID, DRAFT_ID, 'scene-1')).resolves.toBeDefined();
    // Gate MUST have consulted the scoped link query for scene-1
    expect(mockReferenceStarGateRepo.listReferenceBlocksLinkedToScene).toHaveBeenCalledWith(
      expect.objectContaining({ sceneBlockId: 'scene-1' }),
    );
    // Gate MUST have checked stars only for the linked block
    expect(mockReferenceStarGateRepo.listStarsForBlock).toHaveBeenCalledWith('ref-linked');
    // Must NOT check the unlinked block
    expect(mockReferenceStarGateRepo.listStarsForBlock).not.toHaveBeenCalledWith('ref-unlinked');
  });

  it('AC-08b: regenerating scene X with zero linked blocks passes the gate', async () => {
    const unlinkedBlock = makeReferenceBlock('ref-unlinked', 'Unlinked Character', 0);

    mockReferenceBlocksRepo.listReferenceBlocksByDraftId.mockResolvedValue([unlinkedBlock]);

    // No blocks are linked to 'scene-1'
    mockReferenceStarGateRepo.listReferenceBlocksLinkedToScene.mockResolvedValue([]);

    // Should not throw — zero linked blocks passes the scoped gate
    await expect(startStoryboardBlockIllustration(USER_ID, DRAFT_ID, 'scene-1')).resolves.toBeDefined();
    // Gate MUST have consulted the scoped query (even if result is empty)
    expect(mockReferenceStarGateRepo.listReferenceBlocksLinkedToScene).toHaveBeenCalledWith(
      expect.objectContaining({ sceneBlockId: 'scene-1' }),
    );
    // With zero linked blocks there are no stars to check
    expect(mockReferenceStarGateRepo.listStarsForBlock).not.toHaveBeenCalled();
  });

  // ── AC-04 — failed block treated as missing a star ─────────────────────────

  it('AC-04: a failed block with no results counts as missing a star; gate message names it with exit actions', async () => {
    const failedBlock = makeReferenceBlock('ref-failed', 'Failed Character', 0);
    // Simulate failed/empty block: window_status = 'failed', no results means no stars
    failedBlock.windowStatus = 'failed';
    failedBlock.errorMessage = 'Provider error';

    const okBlock = makeReferenceBlock('ref-ok', 'OK Character', 1);

    mockReferenceBlocksRepo.listReferenceBlocksByDraftId.mockResolvedValue([failedBlock, okBlock]);

    // ok block has a star; failed block has no results → no stars
    mockReferenceStarGateRepo.listStarsForBlock.mockImplementation(async (blockId: string) => {
      if (blockId === 'ref-ok') return [makeStar('ref-ok', 'file-ok')];
      return [];
    });

    const error = await startStoryboardIllustrations(USER_ID, DRAFT_ID).catch((e) => e);
    expect(error).toBeInstanceOf(UnprocessableEntityError);
    // Must name the failed block (AC-04: gate message names it)
    expect(error.message).toContain('Failed Character');
    // Must mention exit actions: retry or delete (AC-04: "exit actions retry/delete")
    const msg: string = error.message;
    const hasExitActions = msg.includes('retry') || msg.includes('delete') || msg.includes('Retry') || msg.includes('Delete');
    expect(hasExitActions).toBe(true);
  });
});
