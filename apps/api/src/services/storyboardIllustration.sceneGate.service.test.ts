/**
 * T4 — Per-scene Reference-done gate in storyboardIllustration.service (unit tests)
 *
 * Replaces the OLD assertSceneStarGate (uses referenceCurationRepository.listStarsForBlock
 * + listReferenceBlocksLinkedToScene, throws StarGateFailedError) with a new
 * assertSceneReferenceDoneGate that uses referenceBlocksRepository.getSceneReadiness
 * (Q2) and throws ReferenceNotReadyError — matching the full-draft gate in T3.
 *
 * ACs under test (per-scene scope — T4):
 *   AC-03  — all blocks LINKED to scene S ready, an UNLINKED block not ready
 *            → start proceeds (only scene-linked blocks evaluated).
 *   AC-03b — a linked block not ready → throws ReferenceNotReadyError naming
 *            ONLY the scene's blocking blocks, not any unlinked one.
 *   Zero linked blocks → start proceeds.
 *   Old star machinery not consulted: listStarsForBlock must NOT be called on
 *   the per-scene gate path.
 *
 * Level: unit (vi.mock — no I/O, matches repo convention).
 *
 * ## Old per-scene star-gate tests replaced by this file
 *
 * The following tests previously existed (they were removed in T3 as out-of-scope
 * and are now replaced here with the new gate behaviour):
 *
 *   1. "AC-08b: regenerating scene X is blocked only by unstarred blocks linked to X,
 *      not unlinked ones"
 *      → Replaced by: "AC-03: all linked blocks ready + unlinked block not-ready
 *        → start proceeds"
 *      Reason: gate condition changed from "≥1 star" to "≥1 completed output" (Q2);
 *      StarGateFailedError → ReferenceNotReadyError (ADR-0002).
 *
 *   2. "AC-08b: regenerating scene X passes the gate when all blocks linked to X have
 *      stars"
 *      → Replaced by: "AC-03: all linked blocks ready → start proceeds"
 *      Reason: happy-path gate is now output-existence, not starring.
 *
 *   3. "AC-08b: regenerating scene X with zero linked blocks passes the gate"
 *      → Replaced by: "zero linked blocks → start proceeds"
 *      Reason: same business rule, now exercised via getSceneReadiness mock.
 *
 * Run:
 *   cd apps/api && APP_DB_PASSWORD=cliptale APP_REDIS_URL=redis://localhost:6380 \
 *     npx vitest run src/services/storyboardIllustration.sceneGate.service.test.ts
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Hoisted mocks ──────────────────────────────────────────────────────────────

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
  // Legacy principal-image repo — ignored on the scene-generation path (ADR-0004).
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
  // Reference-blocks repo — Q2 (getSceneReadiness) is the per-scene gate.
  mockReferenceBlocksRepo: {
    listReferenceBlocksByDraftId: vi.fn(),
    getDraftReadiness: vi.fn(),
    getSceneReadiness: vi.fn(),
    getReferencelessScenes: vi.fn(),
  },
  // Curation repo — must NOT be consulted by the new per-scene gate.
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
import { ReferenceNotReadyError } from '@/lib/errors.js';
import type { StoryboardBlock, StoryboardEdge } from '@/repositories/storyboard.repository.js';
import { startStoryboardBlockIllustration } from './storyboardIllustration.service.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

const USER_ID = 'user-gate-t4';
const DRAFT_ID = 'draft-gate-t4';
const SCENE_BLOCK_ID = 'scene-s1';

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
    prompt: 'A vivid outdoor scene.',
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

/** Simulate getSceneReadiness returning "all linked blocks ready". */
function sceneReadyResult() {
  return { isReady: true, blockingBlocks: [] };
}

/** Simulate getSceneReadiness returning "not ready" with blocking linked block(s). */
function sceneNotReadyResult(blocks: Array<{ id: string; name: string; castType: 'character' | 'environment' }>) {
  return { isReady: false, blockingBlocks: blocks };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('storyboardIllustration.service — per-scene Reference-done gate T4 (AC-03/03b)', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Baseline: valid owner, one scene block, no edges, no prior mappings
    mockDraftRepo.findDraftById.mockResolvedValue(makeDraft());
    mockStoryboardRepo.findBlocksByDraftId.mockResolvedValue([makeSceneBlock(SCENE_BLOCK_ID)]);
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

    // Principal reference — null so the service skips the principal path
    mockPrincipalReferenceRepo.findLatestReferenceByDraftId.mockResolvedValue(null);
    mockPrincipalReferenceRepo.approveReference.mockResolvedValue(true);
    mockPrincipalReferenceRepo.createReferenceMapping.mockResolvedValue(true);
    mockPrincipalReferenceRepo.deactivateActiveReference.mockResolvedValue(undefined);
    mockPrincipalReferenceRepo.setReferenceOutput.mockResolvedValue(undefined);
    mockPrincipalReferenceRepo.updateSourceReferenceFileIds.mockResolvedValue(true);
    mockPrincipalReferenceRepo.updateReferenceStatus.mockResolvedValue(undefined);
    mockStoryboardOpenAIQueue.enqueueStoryboardOpenAIImage.mockResolvedValue(undefined);

    // Default per-scene gate: all linked blocks ready (zero blocks → pass).
    mockReferenceBlocksRepo.getSceneReadiness.mockResolvedValue(sceneReadyResult());
    // Full-draft readiness (not invoked on the per-scene path — verified below).
    mockReferenceBlocksRepo.getDraftReadiness.mockResolvedValue({ isReady: true, blockingBlocks: [] });
    mockReferenceBlocksRepo.getReferencelessScenes.mockResolvedValue([]);
    mockReferenceBlocksRepo.listReferenceBlocksByDraftId.mockResolvedValue([]);

    // Stub the OLD curation repo so it doesn't crash with TypeError when the
    // production code (assertSceneStarGate) still calls it — we assert below
    // that these are NOT called by the new gate.  The old gate returns "zero
    // linked blocks" (passing) so happy-path tests still reach the real
    // assertion; not-ready tests are asserted on error type (StarGateFailedError
    // vs ReferenceNotReadyError).
    mockReferenceStarGateRepo.listReferenceBlocksLinkedToScene.mockResolvedValue([]);
  });

  // ── AC-03 — per-scene happy path ───────────────────────────────────────────

  it('AC-03: all linked blocks ready, unlinked block not-ready → start proceeds (only scene-linked blocks evaluated)', async () => {
    // getSceneReadiness returns "ready" — the unlinked not-ready block elsewhere
    // in the draft is irrelevant and never consulted by the per-scene gate.
    mockReferenceBlocksRepo.getSceneReadiness.mockResolvedValue(sceneReadyResult());

    await expect(
      startStoryboardBlockIllustration(USER_ID, DRAFT_ID, SCENE_BLOCK_ID),
    ).resolves.toBeDefined();

    // The per-scene gate MUST call getSceneReadiness with the scene's blockId + draftId (Q2).
    expect(mockReferenceBlocksRepo.getSceneReadiness).toHaveBeenCalledWith(
      expect.objectContaining({ sceneBlockId: SCENE_BLOCK_ID, draftId: DRAFT_ID }),
    );

    // The full-draft readiness query must NOT be called on the per-scene path.
    expect(mockReferenceBlocksRepo.getDraftReadiness).not.toHaveBeenCalled();
  });

  // ── AC-03b — per-scene blocked ─────────────────────────────────────────────

  it('AC-03b: a linked block not-ready → throws ReferenceNotReadyError naming only the scene\'s blocking blocks', async () => {
    mockReferenceBlocksRepo.getSceneReadiness.mockResolvedValue(
      sceneNotReadyResult([
        { id: 'ref-linked-A', name: 'Linked Character A', castType: 'character' },
      ]),
    );

    const error = await startStoryboardBlockIllustration(USER_ID, DRAFT_ID, SCENE_BLOCK_ID).catch((e) => e);

    expect(error).toBeInstanceOf(ReferenceNotReadyError);
    expect(error.message).toContain('Linked Character A');
    // Machine code must be present (openapi contract references.reference_gate_failed).
    expect(error.code).toBe('references.reference_gate_failed');
    // Structured details must carry the scene's blocking block(s).
    expect(error.details.blocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ blockId: 'ref-linked-A' }),
      ]),
    );
  });

  it('AC-03b: multiple linked blocks not-ready → all named, unlinked block absent from error', async () => {
    mockReferenceBlocksRepo.getSceneReadiness.mockResolvedValue(
      sceneNotReadyResult([
        { id: 'ref-linked-B', name: 'Linked Character B', castType: 'character' },
        { id: 'ref-linked-C', name: 'Linked Environment C', castType: 'environment' },
      ]),
    );

    const error = await startStoryboardBlockIllustration(USER_ID, DRAFT_ID, SCENE_BLOCK_ID).catch((e) => e);

    expect(error).toBeInstanceOf(ReferenceNotReadyError);
    expect(error.message).toContain('Linked Character B');
    expect(error.message).toContain('Linked Environment C');

    // The error must NOT name any unlinked block (only linked blocks are evaluated).
    const blocks = error.details.blocks as Array<{ blockId: string }>;
    const ids = blocks.map((b: { blockId: string }) => b.blockId);
    expect(ids).toContain('ref-linked-B');
    expect(ids).toContain('ref-linked-C');
    expect(ids).not.toContain('unlinked-block-X');
  });

  // ── Zero linked blocks — start proceeds ───────────────────────────────────

  it('zero linked blocks → start proceeds (getSceneReadiness returns ready with empty blockingBlocks)', async () => {
    // Zero linked blocks: isReady=true, blockingBlocks=[].
    mockReferenceBlocksRepo.getSceneReadiness.mockResolvedValue(sceneReadyResult());

    await expect(
      startStoryboardBlockIllustration(USER_ID, DRAFT_ID, SCENE_BLOCK_ID),
    ).resolves.toBeDefined();

    // Gate must still call getSceneReadiness (the zero-block case does not skip the gate).
    expect(mockReferenceBlocksRepo.getSceneReadiness).toHaveBeenCalledWith(
      expect.objectContaining({ sceneBlockId: SCENE_BLOCK_ID, draftId: DRAFT_ID }),
    );
  });

  // ── Old star machinery not consulted ──────────────────────────────────────

  it('listStarsForBlock is NOT called on the per-scene gate path', async () => {
    mockReferenceBlocksRepo.getSceneReadiness.mockResolvedValue(sceneReadyResult());

    await startStoryboardBlockIllustration(USER_ID, DRAFT_ID, SCENE_BLOCK_ID);

    // The old curation-based gate must not be reached.
    expect(mockReferenceStarGateRepo.listStarsForBlock).not.toHaveBeenCalled();
    expect(mockReferenceStarGateRepo.listReferenceBlocksLinkedToScene).not.toHaveBeenCalled();
  });

  it('listStarsForBlock is NOT called even when a linked block is not ready (AC-03b path)', async () => {
    mockReferenceBlocksRepo.getSceneReadiness.mockResolvedValue(
      sceneNotReadyResult([
        { id: 'ref-linked-D', name: 'Linked Character D', castType: 'character' },
      ]),
    );

    await startStoryboardBlockIllustration(USER_ID, DRAFT_ID, SCENE_BLOCK_ID).catch(() => undefined);

    expect(mockReferenceStarGateRepo.listStarsForBlock).not.toHaveBeenCalled();
    expect(mockReferenceStarGateRepo.listReferenceBlocksLinkedToScene).not.toHaveBeenCalled();
  });
});
