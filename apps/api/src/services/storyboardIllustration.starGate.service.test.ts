/**
 * T3 — Reference-done gate in storyboardIllustration.service (unit tests)
 *
 * Replaces the old star-gate tests (T10) entirely. The old gate
 * (assertFullSetStarGate / assertSceneStarGate using listStarsForBlock) is
 * being removed by design; every old test in this file previously asserted the
 * starring precondition, which is superseded by the Reference-done gate
 * (ADR-0002). See "Old tests removed / replaced" at the bottom of this block.
 *
 * ACs under test (full-draft start scope — T3):
 *   AC-01  — all blocks ready + all scenes linked → start proceeds (no gate error).
 *   AC-02  — ≥1 not-ready block → ReferenceNotReadyError naming exactly the
 *            blocking blocks.
 *   AC-04  — zero reference blocks → start proceeds (no error).
 *   AC-04b — all ready but ≥1 unlinked scene → UnlinkedScenesError naming the
 *            scenes.
 *   AC-07  — readiness comes from getDraftReadiness (persisted output-existence
 *            read), not from starring / live event / window_status subscription.
 *   AC-09  — non-owner resolve rejects BEFORE any readiness read (getDraftReadiness
 *            must NOT be called when ownership check fails).
 *
 * Gate evaluation order (sad §6 Flow 1):
 *   ownership → readiness → unlinked-scenes → start
 * Encoded as a precedence test: blocking blocks are reported BEFORE unlinked
 * scenes.
 *
 * Level: unit (vi.mock — no I/O, matches repo convention).
 *
 * ## Old star-gate tests removed / replaced
 *
 * The following tests previously lived in this file and are intentionally
 * retired because they asserted the OLD gate behaviour (starring precondition):
 *
 *   1. "AC-08: blocks full-set start when 1 of 3 reference blocks lacks a starred
 *      result, and names exactly that block"
 *      → Replaced by: "AC-02: not-ready blocks → ReferenceNotReadyError naming
 *        exactly the blocking blocks"
 *      Reason: gate condition changed from "≥1 star" to "≥1 completed output"
 *      (ADR-0002); StarGateFailedError removed in favour of ReferenceNotReadyError.
 *
 *   2. "AC-08: allows full-set start when all reference blocks have at least one star"
 *      → Replaced by: "AC-01: all blocks ready + all scenes linked → start proceeds"
 *      Reason: happy-path gate is now output-existence, not starring.
 *
 *   3. "AC-08b (zero blocks): a draft with no reference blocks passes the star gate"
 *      → Replaced by: "AC-04: zero reference blocks → start proceeds (no error)"
 *      Reason: same business rule, now exercised via getDraftReadiness mock.
 *
 *   4. "AC-08b: regenerating scene X is blocked only by unstarred blocks linked to X,
 *      not unlinked ones"
 *      → Out-of-scope for T3 (per-scene gate is T4); removed from this file.
 *
 *   5. "AC-08b: regenerating scene X passes the gate when all blocks linked to X have
 *      stars"
 *      → Out-of-scope for T3 (per-scene gate is T4); removed from this file.
 *
 *   6. "AC-08b: regenerating scene X with zero linked blocks passes the gate"
 *      → Out-of-scope for T3 (per-scene gate is T4); removed from this file.
 *
 *   7. "AC-04: a failed block with no results counts as missing a star; gate message
 *      names it with exit actions"
 *      → Replaced by: "AC-02: still-generating block (no persisted output) →
 *        ReferenceNotReadyError (AC-07 variant)"
 *      Reason: readiness is now output-existence (Q1 / getDraftReadiness), not
 *      listStarsForBlock; failed/empty/still-generating all manifest as "not ready"
 *      via the same getDraftReadiness call.
 *
 * Run:
 *   cd apps/api && APP_DB_PASSWORD=cliptale APP_REDIS_URL=redis://localhost:6380 \
 *     npx vitest run src/services/storyboardIllustration.starGate.service.test.ts
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
  // Legacy principal-image repo — ignored on read in the new gate (ADR-0004).
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
  // Reference-blocks repo — Q1 (getDraftReadiness) and Q3 (getReferencelessScenes).
  mockReferenceBlocksRepo: {
    listReferenceBlocksByDraftId: vi.fn(),
    getDraftReadiness: vi.fn(),
    getReferencelessScenes: vi.fn(),
  },
  // Curation repo — no longer used by the full-draft gate (starring does not gate).
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
import { ForbiddenError, ReferenceNotReadyError, UnlinkedScenesError } from '@/lib/errors.js';
import type { StoryboardBlock, StoryboardEdge } from '@/repositories/storyboard.repository.js';
import { startStoryboardIllustrations } from './storyboardIllustration.service.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

const USER_ID = 'user-gate-t3';
const DRAFT_ID = 'draft-gate-t3';

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

/** Simulate getDraftReadiness returning "all ready" (no blocking blocks). */
function draftReadyResult() {
  return { isReady: true, blockingBlocks: [] };
}

/** Simulate getDraftReadiness returning "not ready" with blocking block(s). */
function draftNotReadyResult(blocks: Array<{ id: string; name: string; castType: 'character' | 'environment' }>) {
  return { isReady: false, blockingBlocks: blocks };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('storyboardIllustration.service — Reference-done gate T3 (AC-01/02/04/04b/07/09)', () => {
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

    // Principal reference — set to null so the service does not try to use it
    // (ADR-0004: principal image retired from scene path; scenes go straight through
    // the reference-done gate, which does not consult the principal reference table).
    mockPrincipalReferenceRepo.findLatestReferenceByDraftId.mockResolvedValue(null);
    mockPrincipalReferenceRepo.approveReference.mockResolvedValue(true);
    mockPrincipalReferenceRepo.createReferenceMapping.mockResolvedValue(true);
    mockPrincipalReferenceRepo.deactivateActiveReference.mockResolvedValue(undefined);
    mockPrincipalReferenceRepo.setReferenceOutput.mockResolvedValue(undefined);
    mockPrincipalReferenceRepo.updateSourceReferenceFileIds.mockResolvedValue(true);
    mockPrincipalReferenceRepo.updateReferenceStatus.mockResolvedValue(undefined);
    mockStoryboardOpenAIQueue.enqueueStoryboardOpenAIImage.mockResolvedValue(undefined);

    // Default Reference-done gate: all ready, no unlinked scenes (zero blocks → pass).
    mockReferenceBlocksRepo.getDraftReadiness.mockResolvedValue(draftReadyResult());
    mockReferenceBlocksRepo.getReferencelessScenes.mockResolvedValue([]);
    mockReferenceBlocksRepo.listReferenceBlocksByDraftId.mockResolvedValue([]);
  });

  // ── AC-01 — happy path ─────────────────────────────────────────────────────

  it('AC-01: all reference blocks ready + all scenes linked → start proceeds (no gate error)', async () => {
    // Simulate a draft that has reference blocks, all ready, and no unlinked scenes.
    mockReferenceBlocksRepo.getDraftReadiness.mockResolvedValue(draftReadyResult());
    mockReferenceBlocksRepo.getReferencelessScenes.mockResolvedValue([]);

    // Should not throw
    await expect(startStoryboardIllustrations(USER_ID, DRAFT_ID)).resolves.toBeDefined();

    // The gate MUST call getDraftReadiness (persisted output-existence read — AC-07).
    expect(mockReferenceBlocksRepo.getDraftReadiness).toHaveBeenCalledWith(
      expect.objectContaining({ draftId: DRAFT_ID }),
    );
  });

  // ── AC-02 — not-ready blocks ───────────────────────────────────────────────

  it('AC-02: ≥1 not-ready block → throws ReferenceNotReadyError naming exactly the blocking blocks', async () => {
    mockReferenceBlocksRepo.getDraftReadiness.mockResolvedValue(
      draftNotReadyResult([
        { id: 'ref-block-B', name: 'Test Character B', castType: 'character' },
      ]),
    );

    const error = await startStoryboardIllustrations(USER_ID, DRAFT_ID).catch((e) => e);

    expect(error).toBeInstanceOf(ReferenceNotReadyError);
    expect(error.message).toContain('Test Character B');
    // AC-02 guidance (review F7): the human-readable error must offer the
    // finish / retry / remove exits, matching the openapi example.
    expect(error.message).toContain('Finish, retry, or remove it before starting.');
    // Machine code must be present (openapi contract references.reference_gate_failed).
    expect(error.code).toBe('references.reference_gate_failed');
    // Structured details must carry the blocking block(s).
    expect(error.details.blocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ blockId: 'ref-block-B' }),
      ]),
    );
  });

  it('AC-02: all 3 blocking blocks named, none of the ready blocks included', async () => {
    mockReferenceBlocksRepo.getDraftReadiness.mockResolvedValue(
      draftNotReadyResult([
        { id: 'ref-block-A', name: 'Character A', castType: 'character' },
        { id: 'ref-block-B', name: 'Environment B', castType: 'environment' },
        { id: 'ref-block-C', name: 'Character C', castType: 'character' },
      ]),
    );

    const error = await startStoryboardIllustrations(USER_ID, DRAFT_ID).catch((e) => e);

    expect(error).toBeInstanceOf(ReferenceNotReadyError);
    expect(error.message).toContain('Character A');
    expect(error.message).toContain('Environment B');
    expect(error.message).toContain('Character C');
    expect(error.message).toContain('Finish, retry, or remove them before starting.');
  });

  // ── AC-04 — zero reference blocks ─────────────────────────────────────────

  it('AC-04: zero reference blocks → start proceeds (prompt-and-style path, no gate error)', async () => {
    // getDraftReadiness with no blocks returns isReady=true, blockingBlocks=[].
    mockReferenceBlocksRepo.getDraftReadiness.mockResolvedValue(draftReadyResult());
    // Zero blocks → getReferencelessScenes is not called (no blocks means the
    // "every scene must be linked" rule does not apply — AC-04b).
    mockReferenceBlocksRepo.getReferencelessScenes.mockResolvedValue([]);

    await expect(startStoryboardIllustrations(USER_ID, DRAFT_ID)).resolves.toBeDefined();

    // Gate must call getDraftReadiness even for the zero-block case (AC-07).
    expect(mockReferenceBlocksRepo.getDraftReadiness).toHaveBeenCalledWith(
      expect.objectContaining({ draftId: DRAFT_ID }),
    );
  });

  // ── AC-04b — unlinked scenes ───────────────────────────────────────────────

  it('AC-04b: all blocks ready but ≥1 unlinked scene → throws UnlinkedScenesError naming the scenes', async () => {
    mockReferenceBlocksRepo.getDraftReadiness.mockResolvedValue(draftReadyResult());
    // Simulate one scene that has no linked reference block.
    mockReferenceBlocksRepo.getReferencelessScenes.mockResolvedValue([
      { id: 'scene-orphan', name: 'Orphan Scene' },
    ]);

    const error = await startStoryboardIllustrations(USER_ID, DRAFT_ID).catch((e) => e);

    expect(error).toBeInstanceOf(UnlinkedScenesError);
    expect(error.message).toContain('Orphan Scene');
    // Machine code must match openapi contract references.unlinked_scenes.
    expect(error.code).toBe('references.unlinked_scenes');
    // Structured details must carry the unlinked scene(s).
    expect(error.details.scenes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ blockId: 'scene-orphan' }),
      ]),
    );
  });

  it('AC-04b: multiple unlinked scenes → all named in UnlinkedScenesError', async () => {
    mockReferenceBlocksRepo.getDraftReadiness.mockResolvedValue(draftReadyResult());
    mockReferenceBlocksRepo.getReferencelessScenes.mockResolvedValue([
      { id: 'scene-1', name: 'Scene One' },
      { id: 'scene-2', name: null },
    ]);

    const error = await startStoryboardIllustrations(USER_ID, DRAFT_ID).catch((e) => e);

    expect(error).toBeInstanceOf(UnlinkedScenesError);
    const scenes: Array<{ blockId: string; name: string | null }> = error.details.scenes as Array<{ blockId: string; name: string | null }>;
    expect(scenes).toHaveLength(2);
    expect(scenes.map((s) => s.blockId)).toContain('scene-1');
    expect(scenes.map((s) => s.blockId)).toContain('scene-2');
  });

  // ── AC-07 — persisted output-existence read (not a live event / subscription) ──

  it('AC-07: readiness comes from getDraftReadiness (persisted read), not from listStarsForBlock or a live subscription', async () => {
    // Gate reads from getDraftReadiness (Q1).
    mockReferenceBlocksRepo.getDraftReadiness.mockResolvedValue(draftReadyResult());
    mockReferenceBlocksRepo.getReferencelessScenes.mockResolvedValue([]);

    await startStoryboardIllustrations(USER_ID, DRAFT_ID);

    // getDraftReadiness MUST be called.
    expect(mockReferenceBlocksRepo.getDraftReadiness).toHaveBeenCalledWith(
      expect.objectContaining({ draftId: DRAFT_ID }),
    );
    // The old star-based read must NOT be called (starring no longer gates — ADR-0002).
    expect(mockReferenceStarGateRepo.listStarsForBlock).not.toHaveBeenCalled();
  });

  it('AC-07 (still-generating instance): block with no persisted output → reported as blocking (AC-02)', async () => {
    // A block whose rolling-window generation is still in progress has no completed
    // output yet; getDraftReadiness returns it as blocking.
    mockReferenceBlocksRepo.getDraftReadiness.mockResolvedValue(
      draftNotReadyResult([
        { id: 'ref-still-gen', name: 'Still-Generating Character', castType: 'character' },
      ]),
    );

    const error = await startStoryboardIllustrations(USER_ID, DRAFT_ID).catch((e) => e);

    expect(error).toBeInstanceOf(ReferenceNotReadyError);
    expect(error.message).toContain('Still-Generating Character');
    // The gate must not have called listStarsForBlock at any point.
    expect(mockReferenceStarGateRepo.listStarsForBlock).not.toHaveBeenCalled();
  });

  // ── AC-09 — non-owner: ownership resolve before any readiness read ─────────

  it('AC-09: non-owner request rejects before getDraftReadiness is called (no state disclosure)', async () => {
    // Ownership resolution returns a draft owned by a different user.
    mockDraftRepo.findDraftById.mockResolvedValue(makeDraft({ userId: 'other-user' }));

    const error = await startStoryboardIllustrations(USER_ID, DRAFT_ID).catch((e) => e);

    // The service must deny (ForbiddenError or NotFoundError — the implementation
    // chooses; what matters is it does NOT reach the readiness read).
    expect(error).toBeInstanceOf(ForbiddenError);

    // getDraftReadiness must NOT have been called — no reference state disclosed.
    expect(mockReferenceBlocksRepo.getDraftReadiness).not.toHaveBeenCalled();
    // getReferencelessScenes must also be untouched.
    expect(mockReferenceBlocksRepo.getReferencelessScenes).not.toHaveBeenCalled();
  });

  // ── Gate precedence: blocking blocks BEFORE unlinked scenes (sad §6 Flow 1) ──

  it('gate precedence: blocking blocks are reported over unlinked scenes when both conditions exist', async () => {
    // Both conditions hold simultaneously:
    mockReferenceBlocksRepo.getDraftReadiness.mockResolvedValue(
      draftNotReadyResult([
        { id: 'ref-block-X', name: 'Unfinished Character X', castType: 'character' },
      ]),
    );
    mockReferenceBlocksRepo.getReferencelessScenes.mockResolvedValue([
      { id: 'scene-orphan', name: 'Orphan Scene' },
    ]);

    const error = await startStoryboardIllustrations(USER_ID, DRAFT_ID).catch((e) => e);

    // The service MUST throw ReferenceNotReadyError (step 2 in the sad §6 order),
    // NOT UnlinkedScenesError (step 3) — blocking blocks take precedence.
    expect(error).toBeInstanceOf(ReferenceNotReadyError);
    expect(error.message).toContain('Unfinished Character X');
    // The message must NOT surface the unlinked scene in this error type.
    expect(error).not.toBeInstanceOf(UnlinkedScenesError);
  });

  it('gate precedence: getReferencelessScenes is NOT called when blocks are not ready', async () => {
    // When readiness check already fails, there is no need to evaluate unlinked scenes.
    mockReferenceBlocksRepo.getDraftReadiness.mockResolvedValue(
      draftNotReadyResult([
        { id: 'ref-block-Y', name: 'Blocking Block Y', castType: 'environment' },
      ]),
    );

    await startStoryboardIllustrations(USER_ID, DRAFT_ID).catch(() => undefined);

    // Short-circuit: unlinked-scene check must not run when readiness already fails.
    expect(mockReferenceBlocksRepo.getReferencelessScenes).not.toHaveBeenCalled();
  });
});
