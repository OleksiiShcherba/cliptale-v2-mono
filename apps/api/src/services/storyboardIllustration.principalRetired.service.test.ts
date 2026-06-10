/**
 * T5 — Principal image retired from scene-generation app path (AC-08)
 *
 * Asserts that after the T5 implementation:
 *   1. Scene start (full-draft and per-scene) does NOT call ensureReadyReference /
 *      createReferenceJob — verified by asserting findLatestReferenceByDraftId and
 *      createReferenceMapping are NOT called on the start paths.
 *   2. Status read (listStoryboardIllustrations) does NOT call getLatestReference
 *      (= findLatestReferenceByDraftId is NOT called); response carries no `reference`
 *      field and no `creating_principal_image` / `awaiting_principal_approval` phases.
 *   3. A seeded legacy principal row (findLatestReferenceByDraftId returns a record)
 *      changes nothing: start and status behave identically — no gate effect, no
 *      reference in payload.
 *
 * ## Old tests in storyboardIllustration.service.test.ts replaced by this file
 *
 * The following tests previously asserted OLD (pre-T5) wire shape / behaviour and
 * are EXPLICITLY superseded once the implementation lands:
 *
 *   1. "enqueues missing scene illustration jobs and draft-scopes the AI job"
 *      → result.reference assertion (lines ~243-259) must be removed; the field no
 *        longer exists on the response.
 *
 *   2. "reports principal image creation while the reference job is active"
 *      → asserts phase 'creating_principal_image' — phase removed; test must be deleted.
 *
 *   3. "reports awaiting approval instead of ready when all scenes are ready but
 *      principal approval is pending"
 *      → asserts phase 'awaiting_principal_approval' — phase removed; test must be deleted.
 *
 *   4. "creates a text-only canonical reference before scene jobs and returns without
 *      scene enqueue"
 *      → entire test describes the old ensureReadyReference path; must be deleted.
 *
 *   5. "does not enqueue scene jobs from explicit block start until the reference is ready"
 *      → old ensureReadyReference guard on per-scene start; must be deleted.
 *
 *   6. "does not create a canonical reference for an explicit empty-prompt scene request"
 *      → old createReferenceJob path; must be deleted.
 *
 *   7. "marks duplicate active canonical reference races failed without enqueueing worker work"
 *      → old createReferenceMapping race; must be deleted.
 *
 *   8. "creates an image-edit canonical reference from linked ready image media refs"
 *      → old createReferenceJob path; must be deleted.
 *
 *   9. "rejects unavailable prompt image references before creating a reference job"
 *      → old createReferenceJob guard; must be deleted.
 *
 *  10. "rejects linked but not-ready image references before creating a reference job"
 *      → old createReferenceJob guard; must be deleted.
 *
 *  11. "does not enqueue scene jobs while the principal image is pending approval"
 *      → old awaiting_principal_approval gate; must be deleted.
 *
 *  12. "does not enqueue explicit block scene jobs while the principal image is pending approval"
 *      → old awaiting_principal_approval gate; must be deleted.
 *
 *  13. "approves a ready principal image for scene generation" (approveStoryboardPrincipalImage)
 *      → old approval endpoint; must be deleted (endpoint removed / route removed by T5).
 *
 *  14. "rejects approving when no ready principal image exists"
 *      → old approval endpoint; must be deleted.
 *
 *  15. "updates extra principal references and clears approval" (setStoryboardPrincipalImageReferences)
 *      → old endpoint; must be deleted.
 *
 *  16. "replaces the principal image with a ready draft-linked image"
 *      → old replaceStoryboardPrincipalImage endpoint; must be deleted.
 *
 *  17. "queues a principal image edit using the active image and extra references"
 *      → old editStoryboardPrincipalImage endpoint; must be deleted.
 *
 *  18. "does not deactivate the active principal image when edit enqueueing fails"
 *      → old editStoryboardPrincipalImage endpoint; must be deleted.
 *
 *  19. "reports idle automation when no planning, reference, or scene blocks exist"
 *      → result.reference call in listStoryboardIllustrations must be removed; also
 *        the test exercises the old getLatestReference path. Superseded by the
 *        "status read — idle phase with zero blocks, no reference field" test below.
 *
 *  20. "reports failed automation with planning, reference, then scene error precedence"
 *      → reference-failed branch is removed; only planning-failed + scene-failed remain.
 *
 *  21. "refreshes completed canonical reference jobs during status polling"
 *      → getLatestReference no longer called on status path; must be deleted.
 *
 *  22. "self-heals stale canonical references that already have an output file"
 *      → result.reference assertion + getLatestReference call; must be deleted.
 *
 *  23. "refreshes failed canonical reference jobs during status polling so they are retryable"
 *      → getLatestReference no longer called on status path; must be deleted.
 *
 *  Also: the `StoryboardAutomationPhase` type must drop
 *  'creating_principal_image' | 'awaiting_principal_approval' and
 *  `StoryboardIllustrationStatusResponse` must drop the `reference` field.
 *  The automation phase tests in the existing file for 'generating_scene_illustrations'
 *  and 'ready' remain valid — they do not depend on the reference field.
 *
 * Level: unit (vi.mock — no I/O, matches repo convention).
 *
 * Run:
 *   cd apps/api && APP_DB_PASSWORD=cliptale APP_REDIS_URL=redis://localhost:6380 \
 *     npx vitest run src/services/storyboardIllustration.principalRetired.service.test.ts
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
  // Legacy principal-image repo — AC-08: ignored on read; must NOT be consulted
  // on the scene-generation path after T5.
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
  // Reference-blocks repo — Q1/Q2 readiness gate (T3/T4).
  mockReferenceBlocksRepo: {
    listReferenceBlocksByDraftId: vi.fn(),
    getDraftReadiness: vi.fn(),
    getSceneReadiness: vi.fn(),
    getReferencelessScenes: vi.fn(),
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
vi.mock('@/queues/jobs/enqueue-storyboard-openai-image.js', () => mockStoryboardOpenAIQueue);
vi.mock('@/repositories/aiGenerationJob.repository.js', () => mockAiJobRepo);
vi.mock('@/repositories/fileLinks.repository.js', () => mockFileLinksRepo);

// ── App imports (after mocks) ──────────────────────────────────────────────────
import type { StoryboardBlock, StoryboardEdge } from '@/repositories/storyboard.repository.js';
import {
  listStoryboardIllustrations,
  startStoryboardBlockIllustration,
  startStoryboardIllustrations,
} from './storyboardIllustration.service.js';
import type { StoryboardIllustrationStatusResponse } from './storyboardIllustration.types.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

const USER_ID = 'user-t5';
const DRAFT_ID = 'draft-t5';
const SCENE_BLOCK_ID = 'scene-t5';

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

/** A legacy principal-image record — the type stored in storyboard_illustration_references. */
function makeLegacyPrincipalRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'legacy-ref-1',
    draftId: DRAFT_ID,
    aiJobId: 'legacy-ref-job-1',
    status: 'ready',
    outputFileId: 'legacy-ref-file-1',
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

describe('storyboardIllustration.service — T5: principal image retired (AC-08)', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Baseline: valid owner, one scene block, no edges, no prior mappings, gate passes
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
    mockStoryboardOpenAIQueue.enqueueStoryboardOpenAIImage.mockResolvedValue(undefined);

    // Reference-done gate: all ready, no unlinked scenes, per-scene ready.
    mockReferenceBlocksRepo.getDraftReadiness.mockResolvedValue({ isReady: true, totalBlocks: 0, blockingBlocks: [] });
    mockReferenceBlocksRepo.getReferencelessScenes.mockResolvedValue([]);
    mockReferenceBlocksRepo.getSceneReadiness.mockResolvedValue({ isReady: true, blockingBlocks: [] });
    mockReferenceBlocksRepo.listReferenceBlocksByDraftId.mockResolvedValue([]);

    // Legacy principal repo — NOT called on scene path after T5.
    // Default: return null so old code won't accidentally pass if it still calls this.
    mockPrincipalReferenceRepo.findLatestReferenceByDraftId.mockResolvedValue(null);
    mockPrincipalReferenceRepo.approveReference.mockResolvedValue(true);
    mockPrincipalReferenceRepo.createReferenceMapping.mockResolvedValue(true);
    mockPrincipalReferenceRepo.deactivateActiveReference.mockResolvedValue(undefined);
    mockPrincipalReferenceRepo.setReferenceOutput.mockResolvedValue(undefined);
    mockPrincipalReferenceRepo.updateSourceReferenceFileIds.mockResolvedValue(true);
    mockPrincipalReferenceRepo.updateReferenceStatus.mockResolvedValue(undefined);
  });

  // ── 1. Scene start (full-draft) does NOT call ensureReadyReference ────────

  it('AC-08: full-draft start does NOT call findLatestReferenceByDraftId (no ensureReadyReference on start path)', async () => {
    await startStoryboardIllustrations(USER_ID, DRAFT_ID);

    expect(mockPrincipalReferenceRepo.findLatestReferenceByDraftId).not.toHaveBeenCalled();
  });

  it('AC-08: full-draft start does NOT call createReferenceMapping (no createReferenceJob on start path)', async () => {
    await startStoryboardIllustrations(USER_ID, DRAFT_ID);

    expect(mockPrincipalReferenceRepo.createReferenceMapping).not.toHaveBeenCalled();
  });

  // ── 2. Scene start (per-scene) does NOT call ensureReadyReference ─────────

  it('AC-08: per-scene start does NOT call findLatestReferenceByDraftId (no ensureReadyReference on per-scene path)', async () => {
    // Provide a ready mapping so the per-scene job can be enqueued.
    mockIllustrationRepo.findLatestIllustrationJobsByDraftId.mockResolvedValue([]);

    await startStoryboardBlockIllustration(USER_ID, DRAFT_ID, SCENE_BLOCK_ID);

    expect(mockPrincipalReferenceRepo.findLatestReferenceByDraftId).not.toHaveBeenCalled();
  });

  it('AC-08: per-scene start does NOT call createReferenceMapping (no createReferenceJob on per-scene path)', async () => {
    await startStoryboardBlockIllustration(USER_ID, DRAFT_ID, SCENE_BLOCK_ID);

    expect(mockPrincipalReferenceRepo.createReferenceMapping).not.toHaveBeenCalled();
  });

  // ── 3. Status read does NOT call getLatestReference ───────────────────────

  it('AC-08: listStoryboardIllustrations does NOT call findLatestReferenceByDraftId (no getLatestReference on status path)', async () => {
    await listStoryboardIllustrations(USER_ID, DRAFT_ID);

    expect(mockPrincipalReferenceRepo.findLatestReferenceByDraftId).not.toHaveBeenCalled();
  });

  // ── 4. Response wire type: no `reference` field ───────────────────────────

  it('AC-08: listStoryboardIllustrations response does NOT carry a `reference` field', async () => {
    const result = await listStoryboardIllustrations(USER_ID, DRAFT_ID);

    // The `reference` field must be absent from the response (key must not exist).
    expect(result).not.toHaveProperty('reference');
  });

  it('AC-08: startStoryboardIllustrations response does NOT carry a `reference` field', async () => {
    const result = await startStoryboardIllustrations(USER_ID, DRAFT_ID);

    expect(result).not.toHaveProperty('reference');
  });

  it('AC-08: startStoryboardBlockIllustration response does NOT carry a `reference` field', async () => {
    const result = await startStoryboardBlockIllustration(USER_ID, DRAFT_ID, SCENE_BLOCK_ID);

    expect(result).not.toHaveProperty('reference');
  });

  // ── 5. Response wire type: no principal automation phases ─────────────────
  // These tests seed the legacy record that would trigger OLD phases under the
  // pre-T5 code. After T5 the legacy repo is never consulted so the phases
  // can never appear regardless of what the record holds.

  it('AC-08: automation phase is never "creating_principal_image" even when legacy record is queued/running', async () => {
    // Seed a legacy queued record. Pre-T5 code: getLatestReference returns this,
    // getAutomationPhase returns 'creating_principal_image'. Post-T5: repo not called.
    mockPrincipalReferenceRepo.findLatestReferenceByDraftId.mockResolvedValue(
      makeLegacyPrincipalRecord({ status: 'running', outputFileId: null, approvalStatus: 'pending', approvedAt: null }),
    );

    const result = await listStoryboardIllustrations(USER_ID, DRAFT_ID);

    expect(result.automation.phase).not.toBe('creating_principal_image');
  });

  it('AC-08: automation phase is never "awaiting_principal_approval" even when legacy record is ready-but-pending', async () => {
    // Seed a legacy ready-but-pending record. Pre-T5: phase is 'awaiting_principal_approval'.
    // Post-T5: repo not called; phase must never be that value.
    mockPrincipalReferenceRepo.findLatestReferenceByDraftId.mockResolvedValue(
      makeLegacyPrincipalRecord({ status: 'ready', approvalStatus: 'pending', approvedAt: null }),
    );
    mockIllustrationRepo.findLatestIllustrationJobsByDraftId.mockResolvedValue([
      {
        id: 'map-1', draftId: DRAFT_ID, blockId: SCENE_BLOCK_ID,
        aiJobId: 'job-ready', status: 'ready', outputFileId: 'scene-file-1',
        errorMessage: null, createdAt: new Date(), updatedAt: new Date(),
      },
    ]);

    const result = await listStoryboardIllustrations(USER_ID, DRAFT_ID);

    expect(result.automation.phase).not.toBe('awaiting_principal_approval');
  });

  it('AC-08: StoryboardAutomationPhase type does not include principal phases (type-level assertion via valid values)', async () => {
    // Derive the set of valid phases from the actual runtime output across multiple
    // states; neither 'creating_principal_image' nor 'awaiting_principal_approval'
    // must appear in any of them.

    // State 1: idle
    mockStoryboardRepo.findBlocksByDraftId.mockResolvedValue([]);
    const idle = await listStoryboardIllustrations(USER_ID, DRAFT_ID);
    expect(['idle', 'planning', 'generating_scene_illustrations', 'ready', 'failed']).toContain(idle.automation.phase);

    // State 2: scenes ready
    mockStoryboardRepo.findBlocksByDraftId.mockResolvedValue([makeSceneBlock(SCENE_BLOCK_ID)]);
    mockIllustrationRepo.findLatestIllustrationJobsByDraftId.mockResolvedValue([
      {
        id: 'map-1', draftId: DRAFT_ID, blockId: SCENE_BLOCK_ID,
        aiJobId: 'job-ready', status: 'ready', outputFileId: 'scene-file-1',
        errorMessage: null, createdAt: new Date(), updatedAt: new Date(),
      },
    ]);
    const ready = await listStoryboardIllustrations(USER_ID, DRAFT_ID);
    expect(['idle', 'planning', 'generating_scene_illustrations', 'ready', 'failed']).toContain(ready.automation.phase);

    // Neither state produced a principal phase.
    expect(idle.automation.phase).not.toBe('creating_principal_image');
    expect(idle.automation.phase).not.toBe('awaiting_principal_approval');
    expect(ready.automation.phase).not.toBe('creating_principal_image');
    expect(ready.automation.phase).not.toBe('awaiting_principal_approval');
  });

  // ── 6. Legacy principal row is ignored on read (AC-08 invariant) ──────────

  it('AC-08: seeded legacy principal row (approved, ready) — full-draft start behaves identically (no gate effect)', async () => {
    // Simulate a pre-existing legacy approved principal row in the repo.
    mockPrincipalReferenceRepo.findLatestReferenceByDraftId.mockResolvedValue(
      makeLegacyPrincipalRecord({ status: 'ready', approvalStatus: 'approved', outputFileId: 'legacy-ref-file-1' }),
    );

    // The start must succeed without being gated on the legacy row.
    await expect(startStoryboardIllustrations(USER_ID, DRAFT_ID)).resolves.toBeDefined();

    // The legacy repo must NOT be consulted on the start path (ignore-on-read — ADR-0004).
    expect(mockPrincipalReferenceRepo.findLatestReferenceByDraftId).not.toHaveBeenCalled();
  });

  it('AC-08: seeded legacy principal row (pending, ready) — full-draft start is NOT blocked (no awaiting_principal_approval gate)', async () => {
    // Old code: pending approvalStatus would prevent scene enqueue and set
    // awaiting_principal_approval. After T5 the legacy row must be ignored.
    mockPrincipalReferenceRepo.findLatestReferenceByDraftId.mockResolvedValue(
      makeLegacyPrincipalRecord({ status: 'ready', approvalStatus: 'pending', approvedAt: null }),
    );

    const result = await startStoryboardIllustrations(USER_ID, DRAFT_ID);

    // Must not be blocked — should proceed to enqueue the first scene job.
    expect(result.automation.phase).not.toBe('awaiting_principal_approval');
    // The legacy repo must NOT be consulted.
    expect(mockPrincipalReferenceRepo.findLatestReferenceByDraftId).not.toHaveBeenCalled();
  });

  it('AC-08: seeded legacy principal row (queued, no output) — full-draft start is NOT blocked (no creating_principal_image gate)', async () => {
    // Old code: queued status would return creating_principal_image phase and skip
    // scene enqueue. After T5 the legacy row must be ignored.
    mockPrincipalReferenceRepo.findLatestReferenceByDraftId.mockResolvedValue(
      makeLegacyPrincipalRecord({ status: 'queued', outputFileId: null, approvalStatus: 'pending', approvedAt: null }),
    );

    const result = await startStoryboardIllustrations(USER_ID, DRAFT_ID);

    expect(result.automation.phase).not.toBe('creating_principal_image');
    expect(mockPrincipalReferenceRepo.findLatestReferenceByDraftId).not.toHaveBeenCalled();
  });

  it('AC-08: seeded legacy principal row (failed) — status read behaves identically to no-legacy-row case (no reference in payload)', async () => {
    // Even a failed legacy row must not surface in the status response.
    mockPrincipalReferenceRepo.findLatestReferenceByDraftId.mockResolvedValue(
      makeLegacyPrincipalRecord({ status: 'failed', outputFileId: null, errorMessage: 'legacy failed' }),
    );

    const result = await listStoryboardIllustrations(USER_ID, DRAFT_ID);

    // No reference in payload.
    expect(result).not.toHaveProperty('reference');
    // Phase must not be 'failed' solely because of the legacy row.
    expect(result.automation.phase).not.toBe('failed');
    // The legacy repo must NOT be consulted.
    expect(mockPrincipalReferenceRepo.findLatestReferenceByDraftId).not.toHaveBeenCalled();
  });

  it('AC-08: seeded legacy principal row — per-scene start behaves identically (no gate effect, no reference in payload)', async () => {
    mockPrincipalReferenceRepo.findLatestReferenceByDraftId.mockResolvedValue(
      makeLegacyPrincipalRecord({ status: 'ready', approvalStatus: 'pending', approvedAt: null }),
    );

    const result = await startStoryboardBlockIllustration(USER_ID, DRAFT_ID, SCENE_BLOCK_ID);

    expect(result).not.toHaveProperty('reference');
    expect(result.automation.phase).not.toBe('awaiting_principal_approval');
    expect(mockPrincipalReferenceRepo.findLatestReferenceByDraftId).not.toHaveBeenCalled();
  });

  // ── 7. StoryboardAutomationPhase type drops the two principal phases ─────
  // (This is the same guard as the phase tests above but isolated to the type,
  // ensuring no valid phase constant equals the retired values.)

  it('AC-08: the automation phase set never includes "creating_principal_image" or "awaiting_principal_approval" across all observable states', async () => {
    // Collect phases across multiple states. After T5, neither retired value
    // can appear; before T5 they can appear when the legacy repo is seeded.

    const phases: string[] = [];

    // State: idle (no blocks)
    mockStoryboardRepo.findBlocksByDraftId.mockResolvedValueOnce([]);
    mockPrincipalReferenceRepo.findLatestReferenceByDraftId.mockResolvedValue(
      makeLegacyPrincipalRecord({ status: 'running', outputFileId: null }),
    );
    const idle = await listStoryboardIllustrations(USER_ID, DRAFT_ID);
    phases.push(idle.automation.phase);

    // State: scenes ready — old code with pending legacy record → awaiting_principal_approval
    mockStoryboardRepo.findBlocksByDraftId.mockResolvedValueOnce([makeSceneBlock(SCENE_BLOCK_ID)]);
    mockIllustrationRepo.findLatestIllustrationJobsByDraftId.mockResolvedValueOnce([
      {
        id: 'map-1', draftId: DRAFT_ID, blockId: SCENE_BLOCK_ID,
        aiJobId: 'job-ready', status: 'ready', outputFileId: 'scene-file-1',
        errorMessage: null, createdAt: new Date(), updatedAt: new Date(),
      },
    ]);
    mockPrincipalReferenceRepo.findLatestReferenceByDraftId.mockResolvedValue(
      makeLegacyPrincipalRecord({ status: 'ready', approvalStatus: 'pending', approvedAt: null }),
    );
    const readyPending = await listStoryboardIllustrations(USER_ID, DRAFT_ID);
    phases.push(readyPending.automation.phase);

    for (const phase of phases) {
      expect(phase).not.toBe('creating_principal_image');
      expect(phase).not.toBe('awaiting_principal_approval');
    }
  });
});
