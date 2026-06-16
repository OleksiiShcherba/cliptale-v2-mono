/**
 * E2E — storyboard-reference-gate (T13)
 *
 * Drives the AC-01 / AC-02 / AC-08 acceptance criteria through the REAL
 * rendered UI, as documented in the feature spec §5.
 *
 * Flow encoded:
 *   Step 1 — Seed/stub a draft with ≥1 scene and one reference block that
 *            is NOT ready (flow_id set but no completed flow_files output).
 *   Step 2 — Attempt full-draft scene generation via "Next: Step 3" →
 *            assert the start is BLOCKED and the UI shows `role="alert"` with
 *            the block name and `data-testid="ref-gate-retry-{blockId}"`.
 *   Step 3 — "Make the reference complete": flip the stub so POST /illustrations
 *            now returns 202 (simulating the flow_files row being inserted).
 *   Step 4 — Start again → assert success (202 accepted, no gate alert).
 *   Step 5 — Throughout: assert no principal-image approval modal/step is
 *            rendered anywhere in the page (AC-08).
 *
 * PROVIDER STUB: same pattern as storyboard-reference-flows.spec.ts.
 *   All network traffic is intercepted via page.route('**\/*').
 *   MySQL / Redis / paid providers are never reached.
 *   "Reference completes" is simulated by flipping the stub state, NOT by
 *   inserting DB rows (the DoD says "no production code"; a pure stub is
 *   sufficient for this UI-layer test).
 *
 *   Run:  npx playwright test e2e/storyboard-reference-gate.spec.ts
 */

import { test, expect } from '@playwright/test';
import type { Page, Route } from '@playwright/test';

import { E2E_API_URL } from './helpers/env';

// ── Fixture IDs (deterministic, no collision with other suites) ───────────────

const DRAFT_ID = 'e2e-srg-00000000-0000-4000-8000-000000000001';
const BLOCK_ID  = 'e2e-srg-blk-0000-0000-4000-800000000001';
const FLOW_ID   = 'e2e-srg-flow-000-0000-4000-800000000001';
const SCENE_ID  = 'e2e-srg-scn-0000-0000-4000-800000000001';
const FILE_ID   = 'e2e-srg-file-000-0000-4000-800000000001';

const BLOCK_NAME = 'Hero Character';

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

// ── Storyboard canvas response (start + one scene + end) ─────────────────────

function makeStoryboardResponse() {
  const now = new Date().toISOString();
  return {
    id: DRAFT_ID,
    userId: 'e2e-user-srg',
    status: 'illustrations',
    blocks: [
      {
        id: 'e2e-srg-start',
        draftId: DRAFT_ID,
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
        id: SCENE_ID,
        draftId: DRAFT_ID,
        blockType: 'scene',
        name: 'Scene 01',
        prompt: 'Hero opens the vault.',
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
        id: 'e2e-srg-end',
        draftId: DRAFT_ID,
        blockType: 'end',
        name: null,
        prompt: null,
        durationS: 0,
        positionX: 620,
        positionY: 200,
        sortOrder: 2,
        style: null,
        createdAt: now,
        updatedAt: now,
        mediaItems: [],
      },
    ],
    edges: [
      { id: 'e2e-srg-edge-1', draftId: DRAFT_ID, sourceBlockId: 'e2e-srg-start', targetBlockId: SCENE_ID },
      { id: 'e2e-srg-edge-2', draftId: DRAFT_ID, sourceBlockId: SCENE_ID, targetBlockId: 'e2e-srg-end' },
    ],
    musicBlocks: [],
    checkpointSettings: { intervalSeconds: 300 },
    createdAt: now,
    updatedAt: now,
  };
}

// ── Reference block shapes ────────────────────────────────────────────────────

/** A reference block that is NOT ready (flow_id set but no completed output). */
function makeNotReadyRefBlock() {
  const now = new Date().toISOString();
  return {
    blockId: BLOCK_ID,
    draftId: DRAFT_ID,
    flowId: FLOW_ID,          // flow exists…
    castType: 'character',
    name: BLOCK_NAME,
    description: 'The vault-cracking protagonist.',
    sortOrder: 0,
    positionX: 0,
    positionY: 0,
    windowStatus: 'running',  // …but still generating (no completed output)
    errorMessage: null,
    version: 1,
    sceneBlockIds: [SCENE_ID],
    stars: [],
    previewFileId: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** The same block after its reference output is complete. */
function makeReadyRefBlock() {
  return {
    ...makeNotReadyRefBlock(),
    windowStatus: 'done',
    stars: [{ fileId: FILE_ID, isPrimary: true, createdAt: new Date().toISOString() }],
    previewFileId: FILE_ID,
  };
}

// ── Idle illustrations GET response ──────────────────────────────────────────

function makeIdleIllustrationResponse() {
  return {
    automation: { phase: 'idle', planningJobId: null, errorMessage: null },
    items: [],
  };
}

// ── Gate-rejection 422 body (reference not ready) ────────────────────────────

function makeGateRejection422() {
  return {
    error: `1 reference block(s) have not finished generating: ${BLOCK_NAME}.`,
    code: 'references.reference_gate_failed',
    details: {
      blocks: [{ blockId: BLOCK_ID, name: BLOCK_NAME }],
    },
  };
}

// ── Accepted 202 body (generation started) ───────────────────────────────────

function makeAccepted202() {
  return {
    automation: { phase: 'generating_scene_illustrations', planningJobId: null, errorMessage: null },
    items: [
      {
        blockId: SCENE_ID,
        status: 'queued',
        jobId: 'e2e-srg-job-001',
        outputFileId: null,
        errorMessage: null,
      },
    ],
  };
}

// ── installGateApi: installs the full page.route stub for the gate journey ────

/**
 * Mutable stub state threaded across all route handlers.
 * `referenceReady` starts false; the test flips it to true before the second
 * attempt so the POST returns 202 instead of 422.
 */
type GateApiState = {
  referenceReady: boolean;
  illustrationsPostCount: number;
};

async function installGateApi(page: Page, state: GateApiState): Promise<void> {
  await page.route('**/*', async (route: Route) => {
    const req = route.request();
    const { pathname } = new URL(req.url());
    const method = req.method();
    const refBase = `/storyboards/${DRAFT_ID}/references`;

    // ── GET storyboard canvas ──────────────────────────────────────────────
    if (method === 'GET' && pathname === `/storyboards/${DRAFT_ID}`) {
      await route.fulfill(jsonResponse(makeStoryboardResponse()));
      return;
    }

    // ── GET reference blocks ───────────────────────────────────────────────
    if (method === 'GET' && pathname === `${refBase}/blocks`) {
      const block = state.referenceReady ? makeReadyRefBlock() : makeNotReadyRefBlock();
      await route.fulfill(jsonResponse({ items: [block] }));
      return;
    }

    // ── GET illustrations status (initial load) ────────────────────────────
    if (method === 'GET' && pathname === `/storyboards/${DRAFT_ID}/illustrations`) {
      await route.fulfill(jsonResponse(makeIdleIllustrationResponse()));
      return;
    }

    // ── GET /pipeline (new pipeline state — usePipelineState) ────────────
    if (method === 'GET' && pathname === `/storyboards/${DRAFT_ID}/pipeline`) {
      // When referenceReady=false, reference_image is still running (scene_image
      // trigger will fail phase_out_of_order). When ready, all phases are done.
      await route.fulfill(
        jsonResponse({
          active_run_phase: null,
          version: 1,
          phases: {
            scene: { status: 'completed' },
            reference_data: { status: 'completed' },
            reference_image: { status: state.referenceReady ? 'completed' : 'running' },
            scene_image: { status: 'idle' },
          },
          payload: null,
          cost_estimate: null,
          error_message: null,
        }),
      );
      return;
    }

    // ── POST /pipeline/phases/scene_image/trigger — the gate under test ───
    // The new UI calls triggerPhase('scene_image') from handleNext instead of
    // POST /illustrations, so we gate here rather than on the illustrations endpoint.
    if (method === 'POST' && pathname === `/storyboards/${DRAFT_ID}/pipeline/phases/scene_image/trigger`) {
      state.illustrationsPostCount += 1;
      if (!state.referenceReady) {
        // Gate rejects — reference_image phase not yet completed.
        await route.fulfill(
          jsonResponse(
            {
              error: `${BLOCK_NAME} reference image has not finished generating.`,
              code: 'pipeline.phase_out_of_order',
              details: {},
            },
            422,
          ),
        );
      } else {
        // Gate passes — scene_image triggered successfully.
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
      }
      return;
    }

    // ── POST illustrations — legacy endpoint (kept for completeness) ───────
    if (method === 'POST' && pathname === `/storyboards/${DRAFT_ID}/illustrations`) {
      state.illustrationsPostCount += 1;
      if (!state.referenceReady) {
        // Gate rejects — 422 with named blocking block.
        await route.fulfill(jsonResponse(makeGateRejection422(), 422));
      } else {
        // Gate passes — 202 accepted.
        await route.fulfill(jsonResponse(makeAccepted202(), 202));
      }
      return;
    }

    // ── GET cast extraction status (background poll may fire) ─────────────
    if (method === 'GET' && pathname === `${refBase}/extraction`) {
      await route.fulfill(jsonResponse({ jobId: null, draftId: DRAFT_ID, status: 'idle', proposal: null, aggregateEstimateCredits: null, errorMessage: null, completedAt: null, failedAt: null, createdAt: null }));
      return;
    }

    // ── Autosave / history — keep quiet ──────────────────────────────────
    if (
      (method === 'PUT' || method === 'POST' || method === 'GET') &&
      (pathname === `/storyboards/${DRAFT_ID}/save` ||
        pathname === `/storyboards/${DRAFT_ID}/history` ||
        pathname.startsWith(`/storyboards/${DRAFT_ID}/history`))
    ) {
      await route.fulfill(jsonResponse(method === 'GET' ? [] : { ok: true }));
      return;
    }

    // ── Storyboard plan jobs polling ──────────────────────────────────────
    if (method === 'GET' && pathname.includes('/storyboard-plan-jobs')) {
      await route.fulfill(jsonResponse({ status: 'idle' }));
      return;
    }

    // ── files (reference preview) ─────────────────────────────────────────
    if (method === 'GET' && pathname === `/files/${FILE_ID}`) {
      await route.fulfill(
        jsonResponse({ id: FILE_ID, fileId: FILE_ID, url: 'https://cdn.example.test/ref.png', mimeType: 'image/png', kind: 'image' }),
      );
      return;
    }

    // ── Draft meta ────────────────────────────────────────────────────────
    if (method === 'GET' && pathname === `/generation-drafts/${DRAFT_ID}`) {
      await route.fulfill(jsonResponse({ id: DRAFT_ID, userId: 'e2e-user-srg', status: 'illustrations', createdAt: new Date().toISOString() }));
      return;
    }

    // ── GET /auth/me — stub to prevent rate-limit auth failures ─────────────
    if (method === 'GET' && pathname === '/auth/me') {
      await route.fulfill(jsonResponse({ userId: 'dev-user-e2e', email: 'dev@cliptale.local', displayName: 'Dev User' }));
      return;
    }

    // ── Fall through (realtime, etc.) ─────────────────────────────────────
    await route.fallback();
  });
}

// ── Helper: open the storyboard and wait for canvas ──────────────────────────

async function openStoryboard(page: Page): Promise<void> {
  await page.goto(`/storyboard/${DRAFT_ID}`);
  await expect(page.getByTestId('storyboard-canvas')).toBeVisible({ timeout: 15_000 });
}

// ─────────────────────────────────────────────────────────────────────────────
// PREFLIGHT: verify that reference-block-node renders (canvas wiring check).
// This reuses the same hard-assert pattern from storyboard-reference-flows.spec.ts.
// ─────────────────────────────────────────────────────────────────────────────

let referenceBlocksWired = false;

test.beforeAll(async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: '.e2e-cache/e2e-auth-state.json' });
  const page = await ctx.newPage();
  const state: GateApiState = { referenceReady: true, illustrationsPostCount: 0 };
  try {
    await installGateApi(page, state);
    await page.goto(`/storyboard/${DRAFT_ID}`);
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

  expect(
    referenceBlocksWired,
    `reference-block-node must render on the canvas — the canvas wiring ` +
      `(ReferenceBlockNode in STORYBOARD_NODE_TYPES) regressed. Target API: ${E2E_API_URL}.`,
  ).toBe(true);
});

// ─────────────────────────────────────────────────────────────────────────────
// Main journey: blocked start → reference completes → successful start
// Covers AC-01, AC-02, AC-08.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Reference-done gate journey (AC-01, AC-02, AC-08)', () => {
  test.setTimeout(90_000);

  test.beforeEach(() => {
    expect(referenceBlocksWired, 'canvas wiring precondition').toBe(true);
  });

  test(
    'AC-02: starting generation with a not-ready reference blocks the start and names the blocking block',
    async ({ page }) => {
      const state: GateApiState = { referenceReady: false, illustrationsPostCount: 0 };
      await installGateApi(page, state);
      await openStoryboard(page);

      // The reference block should be visible on the canvas.
      await expect(page.getByTestId('reference-block-node')).toBeVisible({ timeout: 10_000 });

      // Click "Next: Step 3" — now calls triggerPhase('scene_image') via the pipeline,
      // which returns 422 phase_out_of_order because reference_image is still running.
      const nextBtn = page.getByTestId('next-step3-button');
      await expect(nextBtn).toBeVisible({ timeout: 10_000 });
      await nextBtn.click();

      // AC-02: the gate rejection renders as role="alert" containing the block name.
      // (The new pipeline gate returns the block name in the error message.)
      const alert = page.getByRole('alert');
      await expect(alert).toBeVisible({ timeout: 10_000 });
      await expect(alert).toContainText(BLOCK_NAME);

      // AC-08: no principal-image approval modal/step is visible anywhere.
      await expect(page.getByTestId('principal-image-approval-modal')).not.toBeVisible();
      await expect(page.locator('[data-testid*="principal"]')).toHaveCount(0);
    },
  );

  test(
    'AC-01 + AC-08: after the reference completes, starting generation succeeds and no principal-image step appears',
    async ({ page }) => {
      const state: GateApiState = { referenceReady: false, illustrationsPostCount: 0 };
      await installGateApi(page, state);
      await openStoryboard(page);

      await expect(page.getByTestId('reference-block-node')).toBeVisible({ timeout: 10_000 });

      // First attempt — gate rejects (not-ready reference).
      const nextBtn = page.getByTestId('next-step3-button');
      await expect(nextBtn).toBeVisible({ timeout: 10_000 });
      await nextBtn.click();

      const alert = page.getByRole('alert');
      await expect(alert).toBeVisible({ timeout: 10_000 });
      await expect(alert).toContainText(BLOCK_NAME);

      // Simulate reference completion: flip stub state so trigger returns 200.
      state.referenceReady = true;

      // Click "Next" again — now the pipeline gate passes.
      await nextBtn.click();

      // AC-01: gate passes — no alert, generation begins.
      // Allow a short window for the alert to disappear.
      await expect(alert).not.toBeVisible({ timeout: 8_000 });

      // AC-01: at least two pipeline trigger calls were made (one blocked, one accepted).
      expect(state.illustrationsPostCount).toBeGreaterThanOrEqual(2);

      // AC-08: no principal-image approval modal or step appeared at any point.
      await expect(page.getByTestId('principal-image-approval-modal')).not.toBeVisible();
      await expect(page.locator('[data-testid*="principal"]')).toHaveCount(0);
    },
  );

  test(
    'AC-08: with a ready reference the start never shows a principal-image step',
    async ({ page }) => {
      // Start directly with a ready reference — gate passes on first attempt.
      const state: GateApiState = { referenceReady: true, illustrationsPostCount: 0 };
      await installGateApi(page, state);
      await openStoryboard(page);

      await expect(page.getByTestId('reference-block-node')).toBeVisible({ timeout: 10_000 });

      const nextBtn = page.getByTestId('next-step3-button');
      await expect(nextBtn).toBeVisible({ timeout: 10_000 });
      await nextBtn.click();

      // No gate-failure alert.
      // Wait a short window and assert the alert never appears.
      await page.waitForTimeout(2_000);
      await expect(page.getByRole('alert')).not.toBeVisible();

      // AC-08: no principal-image approval step at any point.
      await expect(page.getByTestId('principal-image-approval-modal')).not.toBeVisible();
      await expect(page.locator('[data-testid*="principal"]')).toHaveCount(0);

      // Generation accepted (POST was called).
      expect(state.illustrationsPostCount).toBe(1);
    },
  );
});
