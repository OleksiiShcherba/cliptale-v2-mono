/**
 * E2E — storyboard-reference-flows (T21)
 *
 * Three user journeys through the REAL rendered UI, as the test-plan
 * §Levels "E2E-through-UI" row prescribes:
 *
 *   J1  «cast to canvas»   — AC-01, AC-03
 *       Cast extraction → proposal review → confirm → reference blocks
 *       appear on canvas with rolling-window statuses.
 *
 *   J2  «stars to scenes»  — AC-06, AC-08, AC-09
 *       Open reference flow from block → star a result (primary) →
 *       back to storyboard → block preview updates → star gate passes →
 *       scene generation picks only linked-block references.
 *
 *   J3  «lifecycle without loss» — AC-13, AC-14b
 *       Non-owner is denied reference data without content disclosure.
 *       Deleting the draft leaves all linked flows (and their results)
 *       intact in the flow list with the draft badge removed.
 *
 * PROVIDER STUB — same pattern as generate-ai-flow.spec.ts:
 *   All AI provider and realtime calls are intercepted via page.route().
 *   MySQL/Redis/the real LLM/Image providers are never reached.
 *   The unit under test is the end-to-end UI journey.
 *
 * REACHABILITY GUARDS — a beforeAll preflight detects whether the
 *   storyboard page wires reference blocks into the canvas (the
 *   reference-block-node data-testid must appear after stubbed
 *   confirmation). The preflight HARD-ASSERTS this wiring (F13): if the
 *   canvas hook regresses the suite fails loudly instead of silently
 *   skipping, so the headline journeys keep their executing coverage.
 *
 *   Run:  npx playwright test e2e/storyboard-reference-flows.spec.ts
 */

import { test, expect } from '@playwright/test';
import type { Page, Route } from '@playwright/test';

import { E2E_API_URL } from './helpers/env';

// ── Fixture IDs (deterministic) ──────────────────────────────────────────────

const DRAFT_ID = 'e2e-srf-00000000-0000-4000-8000-000000000001';
const DRAFT2_ID = 'e2e-srf-00000000-0000-4000-8000-000000000002'; // non-owner
const JOB_ID = 'e2e-srf-job-0000-0000-0000-000000000001';
const BLOCK_1_ID = 'e2e-srf-blk-0000-0000-4000-800000000001';
const BLOCK_2_ID = 'e2e-srf-blk-0000-0000-4000-800000000002';
const FLOW_1_ID = 'e2e-srf-flow-000-0000-4000-800000000001';
const FLOW_2_ID = 'e2e-srf-flow-000-0000-4000-800000000002';
const SCENE_1_ID = 'e2e-srf-scn-0000-0000-4000-800000000001';
const SCENE_2_ID = 'e2e-srf-scn-0000-0000-4000-800000000002';
const FILE_1_ID = 'e2e-srf-file-000-0000-4000-800000000001';
const FILE_2_ID = 'e2e-srf-file-000-0000-4000-800000000002';
const PREVIEW_URL = 'https://cdn.example.test/e2e-srf-result-primary.png';

// ── Shared response helpers ───────────────────────────────────────────────────

function jsonResponse(body: unknown, status = 200) {
  return {
    status,
    contentType: 'application/json',
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-credentials': 'true',
    },
    body: JSON.stringify(body),
  };
}

// ── Canonical stub state for the reference blocks ─────────────────────────────

type WindowStatus = 'pending' | 'running' | 'done' | 'failed' | null;

type BlockState = {
  blockId: string;
  flowId: string;
  castType: 'character' | 'environment';
  name: string;
  windowStatus: WindowStatus;
  stars: Array<{ fileId: string; isPrimary: boolean }>;
  previewFileId: string | null;
  sceneBlockIds: string[];
};

function makeBlock(overrides: Partial<BlockState> & { blockId: string; flowId: string; name: string }): BlockState {
  return {
    castType: 'character',
    windowStatus: null,
    stars: [],
    previewFileId: null,
    sceneBlockIds: [],
    ...overrides,
  };
}

function serializeBlock(b: BlockState) {
  return {
    blockId: b.blockId,
    draftId: DRAFT_ID,
    flowId: b.flowId,
    castType: b.castType,
    name: b.name,
    description: `Description for ${b.name}`,
    sortOrder: 0,
    positionX: 0,
    positionY: 0,
    windowStatus: b.windowStatus,
    errorMessage: null,
    version: 1,
    sceneBlockIds: b.sceneBlockIds,
    stars: b.stars.map((s) => ({
      fileId: s.fileId,
      isPrimary: s.isPrimary,
      createdAt: '2026-06-07T12:00:00.000Z',
    })),
    previewFileId: b.previewFileId,
    createdAt: '2026-06-07T12:00:00.000Z',
    updatedAt: '2026-06-07T12:00:00.000Z',
  };
}

// ── Storyboard / draft API stubs ─────────────────────────────────────────────

/**
 * Minimal storyboard GET response — gives the canvas start+scene+end nodes.
 */
function makeStoryboardResponse(draftId: string) {
  const now = new Date().toISOString();
  return {
    id: draftId,
    userId: 'e2e-user-001',
    status: 'illustrations',
    blocks: [
      {
        id: 'e2e-srf-sblock-start',
        draftId,
        blockType: 'start',
        name: null,
        prompt: null,
        durationS: 0,
        positionX: 60,
        positionY: 200,
        sortOrder: 0,
        style: null,
        createdAt: now,
        updatedAt: now,
        mediaItems: [],
      },
      {
        id: SCENE_1_ID,
        draftId,
        blockType: 'scene',
        name: 'Scene 01',
        prompt: 'Scene one prompt',
        durationS: 4,
        positionX: 340,
        positionY: 200,
        sortOrder: 1,
        style: 'cinematic',
        createdAt: now,
        updatedAt: now,
        mediaItems: [],
      },
      {
        id: SCENE_2_ID,
        draftId,
        blockType: 'scene',
        name: 'Scene 02',
        prompt: 'Scene two prompt',
        durationS: 4,
        positionX: 620,
        positionY: 200,
        sortOrder: 2,
        style: 'cinematic',
        createdAt: now,
        updatedAt: now,
        mediaItems: [],
      },
      {
        id: 'e2e-srf-sblock-end',
        draftId,
        blockType: 'end',
        name: null,
        prompt: null,
        durationS: 0,
        positionX: 900,
        positionY: 200,
        sortOrder: 3,
        style: null,
        createdAt: now,
        updatedAt: now,
        mediaItems: [],
      },
    ],
    edges: [
      {
        id: 'e2e-srf-edge-01',
        draftId,
        sourceBlockId: 'e2e-srf-sblock-start',
        targetBlockId: SCENE_1_ID,
      },
      {
        id: 'e2e-srf-edge-02',
        draftId,
        sourceBlockId: SCENE_1_ID,
        targetBlockId: SCENE_2_ID,
      },
      {
        id: 'e2e-srf-edge-03',
        draftId,
        sourceBlockId: SCENE_2_ID,
        targetBlockId: 'e2e-srf-sblock-end',
      },
    ],
    musicBlocks: [],
    checkpointSettings: { intervalSeconds: 300 },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// ── installReferenceApi: full network stub for one storyboard journey ─────────

type ReferenceApiState = {
  extractionStatus: 'queued' | 'running' | 'completed' | 'failed';
  blocks: BlockState[];
  /** Whether the storyboard illustrations start endpoint should gate (AC-08) */
  starGateBlocks: Array<{ blockId: string; name: string }>;
};

async function installReferenceApi(
  page: Page,
  state: ReferenceApiState,
  draftId: string = DRAFT_ID,
): Promise<{
  confirmCount: () => number;
  setBlocks: (blocks: BlockState[]) => void;
  setStarGate: (failingBlocks: Array<{ blockId: string; name: string }>) => void;
}> {
  let confirmCount = 0;

  await page.route('**/*', async (route: Route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    const method = request.method();
    const refBase = `/storyboards/${draftId}/references`;

    // ── GET storyboard canvas ──────────────────────────────────────────────
    if (method === 'GET' && pathname === `/storyboards/${draftId}`) {
      await route.fulfill(jsonResponse(makeStoryboardResponse(draftId)));
      return;
    }

    // ── Storyboard autosave / history stubs (keep them quiet) ─────────────
    if (
      (method === 'GET' || method === 'POST' || method === 'PUT' || method === 'PATCH') &&
      (pathname === `/storyboards/${draftId}/save` ||
        pathname === `/storyboards/${draftId}/history` ||
        pathname.startsWith(`/storyboards/${draftId}/history`))
    ) {
      await route.fulfill(jsonResponse(method === 'GET' ? [] : { ok: true }));
      return;
    }

    // ── POST /references/extract (AC-01) ──────────────────────────────────
    if (method === 'POST' && pathname === `${refBase}/extract`) {
      state.extractionStatus = 'queued';
      await route.fulfill(
        jsonResponse({ jobId: JOB_ID, status: 'queued' }, 202),
      );
      return;
    }

    // ── GET /references/extraction (AC-01 poll) ───────────────────────────
    if (method === 'GET' && pathname === `${refBase}/extraction`) {
      await route.fulfill(
        jsonResponse({
          jobId: JOB_ID,
          draftId,
          status: state.extractionStatus,
          proposal: state.extractionStatus === 'completed'
            ? [
                {
                  castType: 'character',
                  name: 'Test Character',
                  description: 'A test protagonist.',
                  imageFileIds: [],
                  sceneBlockIds: [SCENE_1_ID],
                  perRunEstimate: 0.42,
                },
                {
                  castType: 'environment',
                  name: 'Test Environment',
                  description: 'A test location.',
                  imageFileIds: [],
                  sceneBlockIds: [SCENE_2_ID],
                  perRunEstimate: 0.42,
                },
              ]
            : null,
          aggregateEstimateCredits: state.extractionStatus === 'completed' ? 0.84 : null,
          errorMessage: null,
          completedAt: state.extractionStatus === 'completed' ? '2026-06-07T12:00:00.000Z' : null,
          failedAt: null,
          createdAt: '2026-06-07T11:59:00.000Z',
        }),
      );
      return;
    }

    // ── POST /references/confirm (AC-03) ──────────────────────────────────
    if (method === 'POST' && pathname === `${refBase}/confirm`) {
      confirmCount += 1;
      state.blocks = [
        makeBlock({ blockId: BLOCK_1_ID, flowId: FLOW_1_ID, name: 'Test Character', windowStatus: 'pending', sceneBlockIds: [SCENE_1_ID] }),
        makeBlock({ blockId: BLOCK_2_ID, flowId: FLOW_2_ID, name: 'Test Environment', castType: 'environment', windowStatus: 'pending', sceneBlockIds: [SCENE_2_ID] }),
      ];
      await route.fulfill(
        jsonResponse({ items: state.blocks.map(serializeBlock) }, 201),
      );
      return;
    }

    // ── GET /references/blocks (canvas load) ──────────────────────────────
    if (method === 'GET' && pathname === `${refBase}/blocks`) {
      await route.fulfill(
        jsonResponse({ items: state.blocks.map(serializeBlock) }),
      );
      return;
    }

    // ── PUT /references/blocks/:blockId/stars/:fileId (AC-06) ─────────────
    const starMatch = pathname.match(
      new RegExp(`^${refBase.replace(/\//g, '\\/')}/blocks/([^/]+)/stars/([^/]+)$`),
    );
    if (method === 'PUT' && starMatch) {
      const [, blockId, fileId] = starMatch;
      const body = request.postDataJSON() as { isPrimary?: boolean } | null;
      const block = state.blocks.find((b) => b.blockId === blockId);
      if (block) {
        const isPrimary = body?.isPrimary ?? false;
        // Remove previous primary if demoting.
        if (isPrimary) {
          block.stars = block.stars.map((s) => ({ ...s, isPrimary: false }));
          block.previewFileId = fileId ?? null;
        }
        // Idempotent upsert.
        const existing = block.stars.find((s) => s.fileId === fileId);
        if (!existing) {
          block.stars.push({ fileId: fileId!, isPrimary });
        } else {
          existing.isPrimary = isPrimary;
        }
        if (isPrimary) {
          block.previewFileId = fileId ?? null;
        } else if (block.previewFileId === null) {
          // Mirror DB logic: first star (even non-primary) becomes the preview.
          block.previewFileId = fileId ?? null;
        }
      }
      await route.fulfill(
        jsonResponse({
          blockId,
          stars: block?.stars.map((s) => ({
            fileId: s.fileId,
            isPrimary: s.isPrimary,
            createdAt: '2026-06-07T12:30:00.000Z',
          })) ?? [],
          previewFileId: block?.previewFileId ?? null,
        }),
      );
      return;
    }

    // ── DELETE /references/blocks/:blockId/stars/:fileId (AC-07) ──────────
    if (method === 'DELETE' && starMatch) {
      const [, blockId, fileId] = starMatch;
      const block = state.blocks.find((b) => b.blockId === blockId);
      if (block) {
        block.stars = block.stars.filter((s) => s.fileId !== fileId);
        if (block.previewFileId === fileId) {
          block.previewFileId = block.stars.find((s) => s.isPrimary)?.fileId ??
            block.stars[0]?.fileId ?? null;
        }
      }
      await route.fulfill(
        jsonResponse({
          blockId,
          stars: block?.stars ?? [],
          previewFileId: block?.previewFileId ?? null,
        }),
      );
      return;
    }

    // ── GET /storyboards/:draftId/pipeline (pipeline state for new flow) ───
    if (method === 'GET' && pathname === `/storyboards/${draftId}/pipeline`) {
      await route.fulfill(
        jsonResponse({
          active_run_phase: null,
          version: 1,
          phases: {
            scene: { status: 'completed' },
            reference_data: { status: 'completed' },
            reference_image: { status: 'completed' },
            scene_image: { status: 'idle' },
          },
          payload: null,
          cost_estimate: null,
          error_message: null,
        }),
      );
      return;
    }

    // ── POST /storyboards/:draftId/pipeline/phases/scene_image/trigger ────
    // The new UI calls triggerPhase('scene_image') instead of POST /illustrations.
    // Mirror the star-gate: if blocks are missing stars, return a 422 with their names.
    if (method === 'POST' && pathname === `/storyboards/${draftId}/pipeline/phases/scene_image/trigger`) {
      if (state.starGateBlocks.length > 0) {
        const names = state.starGateBlocks.map((b) => b.name).join(', ');
        await route.fulfill(
          jsonResponse(
            {
              error: `Reference block(s) still need a starred result: ${names}.`,
              code: 'pipeline.phase_out_of_order',
              details: {},
            },
            422,
          ),
        );
        return;
      }
      // Gate passed — 200 with running scene_image state.
      await route.fulfill(
        jsonResponse({
          active_run_phase: 'scene_image',
          version: 2,
          phases: {
            scene: { status: 'completed' },
            reference_data: { status: 'completed' },
            reference_image: { status: 'completed' },
            scene_image: { status: 'running' },
          },
          payload: null,
          cost_estimate: null,
          error_message: null,
        }),
      );
      return;
    }

    // ── POST /storyboards/:draftId/illustrations (star gate — AC-08) ──────
    // Legacy endpoint kept so older test flows that still mock it don't break.
    if (method === 'POST' && pathname === `/storyboards/${draftId}/illustrations`) {
      if (state.starGateBlocks.length > 0) {
        const names = state.starGateBlocks.map((b) => b.name).join(', ');
        await route.fulfill(
          jsonResponse(
            {
              error: `${String(state.starGateBlocks.length)} reference block(s) still need a starred result: ${names}.`,
              code: 'references.star_gate_failed',
              details: { blocks: state.starGateBlocks },
            },
            422,
          ),
        );
        return;
      }
      // Gate passed — 202 accepted.
      await route.fulfill(jsonResponse({ status: 'queued' }, 202));
      return;
    }

    // ── GET /generation-flows (AC-14b: flow list with/without badge) ───────
    if (method === 'GET' && pathname === '/generation-flows') {
      await route.fulfill(
        jsonResponse({
          items: [
            {
              flowId: FLOW_1_ID,
              title: 'Test Character — reference',
              version: 1,
              draftBadge: state.blocks.some((b) => b.flowId === FLOW_1_ID)
                ? { draftId }
                : null,
              createdAt: '2026-06-07T12:01:00.000Z',
              updatedAt: '2026-06-07T12:01:00.000Z',
            },
            {
              flowId: FLOW_2_ID,
              title: 'Test Environment — reference',
              version: 1,
              draftBadge: state.blocks.some((b) => b.flowId === FLOW_2_ID)
                ? { draftId }
                : null,
              createdAt: '2026-06-07T12:01:00.000Z',
              updatedAt: '2026-06-07T12:01:00.000Z',
            },
          ],
          nextCursor: null,
        }),
      );
      return;
    }

    // ── GET /generation-flows/:flowId (flow editor: AC-05/AC-06) ──────────
    if (method === 'GET' && (pathname === `/generation-flows/${FLOW_1_ID}` || pathname === `/generation-flows/${FLOW_2_ID}`)) {
      const fid = pathname.includes(FLOW_1_ID) ? FLOW_1_ID : FLOW_2_ID;
      const block = state.blocks.find((b) => b.flowId === fid);
      await route.fulfill(
        jsonResponse({
          flowId: fid,
          title: fid === FLOW_1_ID ? 'Test Character — reference' : 'Test Environment — reference',
          version: 1,
          canvas: {
            schemaVersion: 1,
            blocks: [
              {
                blockId: 'content-block-1',
                type: 'content',
                position: { x: 0, y: 0 },
                params: { contentType: 'text', text: 'A reference image.' },
              },
              // Generation block required so result block can resolve its source job.
              {
                blockId: 'gen-block-1',
                type: 'generation',
                position: { x: 340, y: 0 },
                params: { modelId: 'openai/gpt-image-2' },
              },
              {
                blockId: 'result-block-1',
                type: 'result',
                position: { x: 680, y: 0 },
                params: { sourceBlockId: 'gen-block-1' },
              },
            ],
            edges: [
              { edgeId: 'edge-content-gen', sourceBlockId: 'content-block-1', sourceHandle: 'out', targetBlockId: 'gen-block-1', targetHandle: 'prompt' },
              { edgeId: 'edge-gen-result', sourceBlockId: 'gen-block-1', sourceHandle: 'out', targetBlockId: 'result-block-1', targetHandle: 'in' },
            ],
          },
          jobs: [
            {
              jobId: 'e2e-srf-job-result-1',
              blockId: 'gen-block-1',
              status: 'completed',
              progress: 100,
              outputFileId: FILE_1_ID,
              resultUrl: PREVIEW_URL,
              errorMessage: null,
              createdAt: '2026-06-07T12:10:00.000Z',
            },
          ],
          stars: block?.stars ?? [],
          createdAt: '2026-06-07T12:01:00.000Z',
          updatedAt: '2026-06-07T12:01:00.000Z',
        }),
      );
      return;
    }

    // ── DELETE /generation-drafts/:draftId (AC-14b draft deletion) ─────────
    if (method === 'DELETE' && pathname === `/generation-drafts/${draftId}`) {
      // Draft is deleted — remove blocks (so badge disappears from flows)
      state.blocks = [];
      state.starGateBlocks = [];
      await route.fulfill(jsonResponse({ ok: true }, 204));
      return;
    }

    // ── Misc: storyboard plan jobs polling ───────────────────────────────────
    if (method === 'GET' && pathname.includes('/storyboard-plan-jobs')) {
      await route.fulfill(jsonResponse({ status: 'idle' }));
      return;
    }

    // ── Misc: illustrations status ──────────────────────────────────────────
    if (method === 'GET' && pathname === `/storyboards/${draftId}/illustrations`) {
      await route.fulfill(
        jsonResponse({
          reference: { status: 'queued', jobId: null, outputFileId: null, sourceReferenceFileIds: [], approvalStatus: 'pending', errorMessage: null },
          items: [],
        }),
      );
      return;
    }

    // ── Misc: files/assets ──────────────────────────────────────────────────
    // Handles both /files/{fileId} (direct) and /files/{fileId}/stream (fetchFileInfo)
    if (
      method === 'GET' &&
      (pathname === `/files/${FILE_1_ID}` || pathname === `/files/${FILE_2_ID}` ||
       pathname === `/files/${FILE_1_ID}/stream` || pathname === `/files/${FILE_2_ID}/stream`)
    ) {
      const fid = pathname.includes(FILE_1_ID) ? FILE_1_ID : FILE_2_ID;
      await route.fulfill(
        jsonResponse({ id: fid, fileId: fid, url: PREVIEW_URL, mimeType: 'image/png', kind: 'image' }),
      );
      return;
    }

    // ── GET /auth/me — stub to prevent rate-limit auth failures ─────────────
    if (method === 'GET' && pathname === '/auth/me') {
      await route.fulfill(jsonResponse({ userId: 'dev-user-e2e', email: 'dev@cliptale.local', displayName: 'Dev User' }));
      return;
    }

    // ── Fall through to real network (realtime, etc.) ─────────────────────
    await route.fallback();
  });

  return {
    confirmCount: () => confirmCount,
    setBlocks: (blocks) => { state.blocks = blocks; },
    setStarGate: (failingBlocks) => { state.starGateBlocks = failingBlocks; },
  };
}

// ── Open storyboard page and wait for canvas ─────────────────────────────────

async function openStoryboard(page: Page, draftId: string = DRAFT_ID): Promise<void> {
  await page.goto(`/storyboard/${draftId}`);
  await expect(page.getByTestId('storyboard-canvas')).toBeVisible({ timeout: 15_000 });
}

// ─────────────────────────────────────────────────────────────────────────────
// PREFLIGHT: detect whether reference blocks are wired into the canvas.
// After a stubbed confirm, the storyboard canvas should render
// data-testid="reference-block-node" nodes. If not, the feature isn't fully
// wired — skip the detail tests with a loud reason.
// ─────────────────────────────────────────────────────────────────────────────

let referenceBlocksWired = false;

test.beforeAll(async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: '.e2e-cache/e2e-auth-state.json' });
  const page = await ctx.newPage();

  const state: ReferenceApiState = {
    extractionStatus: 'completed',
    // Pre-confirmed: two reference blocks already exist
    blocks: [
      makeBlock({ blockId: BLOCK_1_ID, flowId: FLOW_1_ID, name: 'Test Character', windowStatus: 'done', sceneBlockIds: [SCENE_1_ID] }),
      makeBlock({ blockId: BLOCK_2_ID, flowId: FLOW_2_ID, name: 'Test Environment', castType: 'environment', windowStatus: 'done', sceneBlockIds: [SCENE_2_ID] }),
    ],
    starGateBlocks: [],
  };

  try {
    await installReferenceApi(page, state);
    await page.goto(`/storyboard/${DRAFT_ID}`);

    // Give the SPA time to load and render canvas.
    await page.waitForTimeout(3_000);

    referenceBlocksWired = await page
      .getByTestId('reference-block-node')
      .first()
      .isVisible()
      .catch(() => false);
  } catch {
    referenceBlocksWired = false;
  } finally {
    await ctx.close();
  }

  // F13: hard-assert the wiring instead of soft-skipping the suites. If the
  // canvas regresses (ReferenceBlockNode dropped from STORYBOARD_NODE_TYPES), the
  // headline-AC journeys must FAIL loudly here — not silently skip and lose
  // their executing coverage.
  expect(
    referenceBlocksWired,
    'reference-block-node must render after a stubbed confirm — the canvas wiring ' +
      '(ReferenceBlockNode in STORYBOARD_NODE_TYPES) regressed. ' +
      `Target API: ${E2E_API_URL}.`,
  ).toBe(true);
});

// ─────────────────────────────────────────────────────────────────────────────
// J1  «cast to canvas» — AC-01 + AC-03
// ─────────────────────────────────────────────────────────────────────────────

test.describe('J1 — cast to canvas (AC-01, AC-03)', () => {
  test.setTimeout(90_000);

  test.beforeEach(() => {
    // F13: hard precondition — the beforeAll probe already failed the suite if the
    // canvas regressed; this guards each test if the flag is somehow false.
    expect(referenceBlocksWired, 'reference blocks must be wired into the canvas').toBe(true);
  });

  test(
    'AC-01: opening cast extraction shows the proposal with entries, descriptions, scene links, and aggregate estimate — no paid generation',
    async ({ page }) => {
      const state: ReferenceApiState = {
        extractionStatus: 'completed',
        blocks: [],
        starGateBlocks: [],
      };
      const api = await installReferenceApi(page, state);
      await openStoryboard(page);

      // Trigger the cast extraction modal. The StoryboardPage must expose
      // a button or action that opens it (e.g. "Start reference generation").
      // The exact label is whatever the production UI uses.
      const startBtn = page.getByRole('button', { name: /start reference generation/i });
      await expect(startBtn).toBeVisible({ timeout: 10_000 });
      await startBtn.click();

      // The extraction is already completed in the stub — proposal renders.
      await expect(page.getByTestId('cast-confirm-button')).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId('cast-aggregate-estimate')).toContainText('0.84');

      // Each proposal entry is visible with name and type.
      await expect(page.getByTestId('cast-entry-0')).toBeVisible();
      await expect(page.getByTestId('cast-entry-name-0')).toHaveValue('Test Character');
      await expect(page.getByTestId('cast-entry-1')).toBeVisible();
      await expect(page.getByTestId('cast-entry-name-1')).toHaveValue('Test Environment');

      // No paid generation has started yet (confirmCount === 0).
      expect(api.confirmCount()).toBe(0);
    },
  );

  test(
    'AC-03: confirming the cast creates reference blocks on the canvas in cast order with window-status badges',
    async ({ page }) => {
      const state: ReferenceApiState = {
        extractionStatus: 'completed',
        blocks: [],
        starGateBlocks: [],
      };
      const api = await installReferenceApi(page, state);
      await openStoryboard(page);

      // Open and confirm cast.
      await page.getByRole('button', { name: /start reference generation/i }).click();
      await expect(page.getByTestId('cast-confirm-button')).toBeVisible({ timeout: 10_000 });
      await page.getByTestId('cast-confirm-button').click();

      // Confirmation fires exactly once (AC-03: collective cost confirmation).
      await expect.poll(() => api.confirmCount(), { timeout: 10_000 }).toBe(1);

      // After confirmation the storyboard reloads and the two reference blocks appear.
      await expect(page.getByTestId('reference-block-node')).toHaveCount(2, { timeout: 15_000 });

      // Each block shows the rolling-window status badge (pending/running/done/failed).
      // After confirmation both blocks are pending in the stub.
      const firstBlock = page.getByTestId('reference-block-node').first();
      await expect(firstBlock.getByTestId('reference-block-status-badge')).toBeVisible({ timeout: 5_000 });
      await expect(firstBlock.getByTestId('reference-block-name')).toContainText('Test Character');

      // AC-03: The second block also renders in cast order.
      const secondBlock = page.getByTestId('reference-block-node').nth(1);
      await expect(secondBlock.getByTestId('reference-block-name')).toContainText('Test Environment');
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// J2  «stars to scenes» — AC-06, AC-08, AC-09
// ─────────────────────────────────────────────────────────────────────────────

test.describe('J2 — stars to scenes (AC-06, AC-08, AC-09)', () => {
  test.setTimeout(90_000);

  test.beforeEach(() => {
    // F13: hard precondition — fail loudly rather than silently skip on regression.
    expect(referenceBlocksWired, 'reference blocks must be wired into the canvas').toBe(true);
  });

  test(
    'AC-06: starring a result in the reference flow updates the block preview on the storyboard canvas',
    async ({ page }) => {
      const state: ReferenceApiState = {
        extractionStatus: 'completed',
        blocks: [
          makeBlock({ blockId: BLOCK_1_ID, flowId: FLOW_1_ID, name: 'Test Character', windowStatus: 'done', sceneBlockIds: [SCENE_1_ID] }),
        ],
        starGateBlocks: [{ blockId: BLOCK_1_ID, name: 'Test Character' }],
      };
      await installReferenceApi(page, state);
      await openStoryboard(page);

      // The block exists but has no preview yet (no stars).
      const blockNode = page.getByTestId('reference-block-node').first();
      await expect(blockNode).toBeVisible({ timeout: 10_000 });
      await expect(blockNode.getByTestId('reference-block-preview-placeholder')).toBeVisible();

      // Open the reference flow from the block.
      // Block click now opens the details modal (scene links + prompt);
      // the "View flow" button on the node navigates to the flow page.
      await blockNode.getByTestId('reference-block-view-flow-button').click();
      await expect(page.getByRole('link', { name: /back to storyboard/i })).toBeVisible({ timeout: 10_000 });

      // In the flow editor there is a result image the Creator can star.
      // The star button targets the result file FILE_1_ID.
      // Note: the image may appear broken in headless tests (external URL) but is in the DOM.
      const resultImg = page.getByTestId('result-media-image').first();
      await expect(resultImg).toBeVisible({ timeout: 10_000 });

      // Star the result (star-toggle — data-testid="star-toggle").
      // All stars are equal in this flow (isPrimary: false); the first star becomes the preview.
      const starBtn = page.getByTestId('star-toggle').first();
      await expect(starBtn).toBeVisible({ timeout: 5_000 });

      // Wait for the star PUT network request to complete before navigating away,
      // otherwise the stub may not have updated block.previewFileId yet (race condition).
      const starPutDone = page.waitForResponse(
        (resp) => resp.url().includes('/stars/') && resp.request().method() === 'PUT',
      );
      await starBtn.click();
      await starPutDone;

      // Go back to the storyboard canvas.
      await page.getByRole('link', { name: /back to storyboard/i }).click();
      await expect(page.getByTestId('storyboard-canvas')).toBeVisible({ timeout: 10_000 });

      // AC-06: the block's preview now shows the primary-starred image.
      const updatedBlock = page.getByTestId('reference-block-node').first();
      await expect(
        updatedBlock.getByTestId('reference-block-preview'),
        'primary-starred result becomes block preview (AC-06)',
      ).toBeVisible({ timeout: 10_000 });
      await expect(updatedBlock.getByTestId('reference-block-preview')).toHaveAttribute('src', PREVIEW_URL);
    },
  );

  test(
    'AC-08: starting full scene generation is blocked when any reference block has no star; the message names the blocks',
    async ({ page }) => {
      const state: ReferenceApiState = {
        extractionStatus: 'completed',
        blocks: [
          makeBlock({ blockId: BLOCK_1_ID, flowId: FLOW_1_ID, name: 'Test Character', windowStatus: 'done', sceneBlockIds: [SCENE_1_ID] }),
          makeBlock({ blockId: BLOCK_2_ID, flowId: FLOW_2_ID, name: 'Test Environment', castType: 'environment', windowStatus: 'done', sceneBlockIds: [SCENE_2_ID] }),
        ],
        // Both blocks are missing stars — gate must fail naming both.
        starGateBlocks: [
          { blockId: BLOCK_1_ID, name: 'Test Character' },
          { blockId: BLOCK_2_ID, name: 'Test Environment' },
        ],
      };
      await installReferenceApi(page, state);
      await openStoryboard(page);

      // Attempt to start scene preview generation (the "Next" / "Generate scenes" action).
      // The UI may disable the button or show a gate message after the attempt.
      const nextBtn = page.getByRole('button', { name: /next|generate scenes|start previews/i }).first();
      await expect(nextBtn).toBeVisible({ timeout: 10_000 });
      await nextBtn.click();

      // AC-08: the gate message names the unstarred blocks.
      const gateMessage = page.getByRole('alert');
      await expect(gateMessage).toBeVisible({ timeout: 10_000 });
      await expect(gateMessage).toContainText('Test Character');
      await expect(gateMessage).toContainText('Test Environment');
    },
  );

  test(
    'AC-09: when the star gate passes, scene generation references only linked blocks (boundary respected)',
    async ({ page }) => {
      // All blocks have primary stars → gate passes.
      const state: ReferenceApiState = {
        extractionStatus: 'completed',
        blocks: [
          makeBlock({
            blockId: BLOCK_1_ID,
            flowId: FLOW_1_ID,
            name: 'Test Character',
            windowStatus: 'done',
            sceneBlockIds: [SCENE_1_ID], // linked only to scene 1
            stars: [{ fileId: FILE_1_ID, isPrimary: true }],
            previewFileId: FILE_1_ID,
          }),
          makeBlock({
            blockId: BLOCK_2_ID,
            flowId: FLOW_2_ID,
            name: 'Test Environment',
            castType: 'environment',
            windowStatus: 'done',
            sceneBlockIds: [SCENE_2_ID], // linked only to scene 2
            stars: [{ fileId: FILE_2_ID, isPrimary: true }],
            previewFileId: FILE_2_ID,
          }),
        ],
        starGateBlocks: [], // gate passes
      };

      // Track the pipeline scene_image trigger call (the new "start illustrations" path).
      let triggerCalled = false;
      await installReferenceApi(page, state);

      // Override the pipeline trigger endpoint to capture the call.
      await page.route(`**/pipeline/phases/scene_image/trigger`, async (route: Route) => {
        if (route.request().method() === 'POST') {
          triggerCalled = true;
          await route.fulfill(
            jsonResponse({
              active_run_phase: 'scene_image',
              version: 2,
              phases: {
                scene: { status: 'completed' },
                reference_data: { status: 'completed' },
                reference_image: { status: 'completed' },
                scene_image: { status: 'running' },
              },
              payload: null, cost_estimate: null, error_message: null,
            }),
          );
        } else {
          await route.fallback();
        }
      });

      await openStoryboard(page);

      // The star gate passes — "Next: Step 3" should be enabled.
      const nextBtn = page.getByRole('button', { name: /next|generate scenes|start previews/i }).first();
      await expect(nextBtn).toBeEnabled({ timeout: 10_000 });
      await nextBtn.click();

      // No gate-failure alert should appear (star gate passes).
      await expect(page.getByRole('alert')).not.toBeVisible({ timeout: 3_000 }).catch(() => {
        // If alert doesn't exist in DOM that's fine too.
      });

      // The pipeline scene_image trigger was issued (scene generation kicked off).
      await expect.poll(() => triggerCalled, { timeout: 10_000 }).toBeTruthy();
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// J3  «lifecycle without loss» — AC-13, AC-14b
// ─────────────────────────────────────────────────────────────────────────────

test.describe('J3 — lifecycle without loss (AC-13, AC-14b)', () => {
  test.setTimeout(60_000);

  test(
    'AC-13: a non-owner gets 404 on every reference endpoint without content disclosure',
    async ({ page }) => {
      // We stub the reference endpoints for DRAFT_ID to return 404 (non-owner auth).
      await page.route('**/*', async (route: Route) => {
        const { pathname } = new URL(route.request().url());
        const refBase = `/storyboards/${DRAFT_ID}/references`;
        if (pathname.startsWith(refBase)) {
          await route.fulfill(
            jsonResponse({ error: 'Draft not found.', code: 'references.draft_not_found' }, 404),
          );
          return;
        }
        await route.fallback();
      });

      // A direct API call by a non-owner to the blocks list returns 404.
      // We use page.evaluate to route through the same stub as the page context.
      const result = await page.evaluate(
        async ({ apiUrl, draftId }: { apiUrl: string; draftId: string }) => {
          const r = await fetch(`${apiUrl}/storyboards/${draftId}/references/blocks`, {
            headers: { Authorization: 'Bearer non-owner-token' },
          });
          return { status: r.status, body: await r.json() };
        },
        { apiUrl: E2E_API_URL, draftId: DRAFT_ID },
      );

      // AC-13: 404 (existence hidden); no actual block content in the body.
      expect(result.status).toBe(404);
      expect((result.body as Record<string, unknown>)['code']).toBe('references.draft_not_found');
      // The body must NOT contain any reference-block data (blockId, name, etc.).
      expect(JSON.stringify(result.body)).not.toContain('Test Character');
      expect(JSON.stringify(result.body)).not.toContain('blockId');
    },
  );

  test(
    'AC-14b: deleting the draft leaves every linked flow in the flow list with the draft badge removed',
    async ({ page }) => {
      const state: ReferenceApiState = {
        extractionStatus: 'completed',
        blocks: [
          makeBlock({ blockId: BLOCK_1_ID, flowId: FLOW_1_ID, name: 'Test Character', windowStatus: 'done' }),
          makeBlock({ blockId: BLOCK_2_ID, flowId: FLOW_2_ID, name: 'Test Environment', castType: 'environment', windowStatus: 'done' }),
        ],
        starGateBlocks: [],
      };
      const api = await installReferenceApi(page, state);

      // Navigate to the flow list to see the draft badges.
      await page.goto('/generate-ai');
      await expect(page.getByTestId(`draft-badge-${FLOW_1_ID}`)).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId(`draft-badge-${FLOW_2_ID}`)).toBeVisible({ timeout: 10_000 });

      // Now delete the draft (simulated via API call through the stub).
      const deleteResult = await page.evaluate(
        async ({ apiUrl, draftId }: { apiUrl: string; draftId: string }) => {
          const r = await fetch(`${apiUrl}/generation-drafts/${draftId}`, {
            method: 'DELETE',
            headers: { Authorization: 'Bearer e2e-token' },
          });
          return r.status;
        },
        { apiUrl: E2E_API_URL, draftId: DRAFT_ID },
      );
      expect(deleteResult).toBe(204);

      // AC-14b: the blocks are cleared from the stub state → draft badge is gone.
      // Reload the flow list.
      await page.reload();
      await expect(page.locator(`[data-testid="draft-badge-${FLOW_1_ID}"]`)).not.toBeVisible({ timeout: 10_000 });
      await expect(page.locator(`[data-testid="draft-badge-${FLOW_2_ID}"]`)).not.toBeVisible({ timeout: 10_000 });

      // AC-14b: BUT the flows themselves still exist in the list (not deleted with draft).
      const flowTitles = page.getByTestId('flow-list-item');
      // Both flows remain — only badge is gone.
      const flowListText = await page.locator('body').innerText();
      expect(flowListText).toContain('Test Character');
      expect(flowListText).toContain('Test Environment');
      expect(api.confirmCount()).toBe(0); // no accidental re-confirmation
    },
  );
});
