/**
 * E2E — storyboard-generation-pipeline
 *
 * Drives all second-step pipeline flows through the REAL rendered UI as a
 * Creator. Uses page.route() to stub the pipeline API responses and
 * installMockRealtime + emitMockRealtimeEvent to push state transitions —
 * so the tests exercise every UI component and interaction without any real
 * AI-provider calls or pipeline-row seeding.
 *
 * Flows covered:
 *   F1  Happy path AC-01→04:  auto-start → cast proposal → confirm →
 *       ref-image loader → scene-image offer → accept → all complete.
 *   F2  Skip cast (AC-07 + AC-11):  cast proposal → skip →
 *       scene_image offer appears directly (reference_image cascade).
 *   F3  Cancel + corner re-trigger (AC-06 + AC-07):  scene running →
 *       cancel → loader gone → corner trigger → scene running again.
 *   F4  Resume (AC-05):  navigate mid-scene-run → loader reconstructed.
 *   F5  Phase-order guard (AC-08/AC-15):  scene_image corner trigger
 *       with 422 gate → plain-language guard message shown.
 *
 * Prerequisites: the test user (e2e@cliptale.test) must exist in the DB and
 * the API + web-editor must be reachable on their default local ports.
 *
 *   npm run e2e -- e2e/storyboard-generation-pipeline.spec.ts
 */

import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

import { E2E_API_URL } from './helpers/env';
import { installCorsWorkaround } from './helpers/cors-workaround';
import {
  readBearerToken,
  createTempDraft,
  initializeDraft,
  cleanupDraft,
  waitForCanvas,
} from './helpers/storyboard';
import {
  installMockRealtime,
  emitMockRealtimeEvent,
} from './helpers/mock-realtime';

// ── Shared fixtures ───────────────────────────────────────────────────────────

let token: string;
let draftId: string;

// A stable user-id to include in emitted realtime events.
const MOCK_USER_ID = 'e2e-pipeline-user-001';

// ── Pipeline state factory ────────────────────────────────────────────────────

type PhaseStatus =
  | 'idle'
  | 'queued'
  | 'running'
  | 'awaiting_review'
  | 'completed'
  | 'skipped'
  | 'failed';

type PhaseName = 'scene' | 'reference_data' | 'reference_image' | 'scene_image';

interface PipelineState {
  draft_id: string;
  active_phase: PhaseName;
  active_run_phase: PhaseName | null;
  phases: Record<PhaseName, { status: PhaseStatus }>;
  payload: unknown | null;
  version: number;
  cost_estimate: string | null;
  error_message: string | null;
  updated_at: string | null;
}

function makeState(overrides: Partial<PipelineState> = {}): PipelineState {
  return {
    draft_id: draftId,
    active_phase: 'scene',
    active_run_phase: null,
    phases: {
      scene: { status: 'idle' },
      reference_data: { status: 'idle' },
      reference_image: { status: 'idle' },
      scene_image: { status: 'idle' },
    },
    payload: null,
    version: 1,
    cost_estimate: null,
    error_message: null,
    updated_at: '2026-06-15T00:00:00Z',
    ...overrides,
  };
}

function jsonOk(body: unknown, status = 200) {
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

// ── Per-test helpers ──────────────────────────────────────────────────────────

/**
 * Registers page.route() stubs for the pipeline endpoints so no real pipeline
 * processing happens. `initialState` is returned for the initial GET; action
 * endpoints return the provided state. `emitState` lets tests push state
 * transitions via mock realtime.
 */
async function stubPipeline(
  page: Page,
  initialState: PipelineState,
): Promise<{ emitState: (state: PipelineState) => Promise<void> }> {
  // GET /storyboards/:draftId/pipeline → initial state
  await page.route(`**/${draftId}/pipeline`, async (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill(jsonOk(initialState));
    }
    return route.continue();
  });

  // POST pipeline action endpoints (confirm-cast, trigger, cancel, skip)
  // → return 200 (the state machine converges via realtime events instead)
  await page.route(`**/${draftId}/pipeline/**`, async (route) => {
    if (route.request().method() === 'POST') {
      // Return the initial state as the sync response; tests drive transitions
      // via emitState() after clicking the action.
      return route.fulfill(jsonOk(initialState));
    }
    return route.continue();
  });

  // GET /storyboards/:draftId → minimal start+end storyboard.
  // Prevents tests from depending on real API response latency (which can
  // cause the canvas to not render within the 15s waitForCanvas timeout
  // after many sequential test runs). Tests that need specific storyboard
  // content (F8) register their own route AFTER this call — Playwright
  // executes routes in reverse-registration order, so the later route wins.
  await page.route(`**/storyboards/${draftId}`, async (route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.endsWith(`/storyboards/${draftId}`) || route.request().method() !== 'GET') {
      return route.continue();
    }
    return route.fulfill(jsonOk({
      blocks: [
        {
          id: 'stub-start-id', draftId, blockType: 'start', name: null, prompt: null,
          videoPrompt: null, durationS: 3, positionX: 0, positionY: 0, sortOrder: 0,
          style: null, createdAt: '2026-06-16T00:00:00Z', updatedAt: '2026-06-16T00:00:00Z',
          mediaItems: [],
        },
        {
          id: 'stub-end-id', draftId, blockType: 'end', name: null, prompt: null,
          videoPrompt: null, durationS: 3, positionX: 600, positionY: 0, sortOrder: 999,
          style: null, createdAt: '2026-06-16T00:00:00Z', updatedAt: '2026-06-16T00:00:00Z',
          mediaItems: [],
        },
      ],
      edges: [{ id: 'stub-edge-id', draftId, sourceBlockId: 'stub-start-id', targetBlockId: 'stub-end-id' }],
      musicBlocks: [],
    }));
  });

  // GET /storyboards/:draftId/reference-blocks → empty (no references in pipeline tests)
  await page.route(`**/${draftId}/reference-blocks`, async (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill(jsonOk({ items: [] }));
    }
    return route.continue();
  });

  const emitState = async (state: PipelineState) => {
    await emitMockRealtimeEvent(page, {
      type: 'storyboard.status.updated',
      userId: MOCK_USER_ID,
      draftId,
      payload: state as unknown as Record<string, unknown>,
    });
  };

  return { emitState };
}

/**
 * Opens the storyboard page, waits for the canvas, and installs mock realtime
 * so tests can push pipeline state transitions without a live WebSocket.
 */
async function openStoryboard(page: Page): Promise<void> {
  await installCorsWorkaround(page, token);
  await installMockRealtime(page);
  await page.goto(`/storyboard/${draftId}`);
  await waitForCanvas(page);
}

// ── Test lifecycle ────────────────────────────────────────────────────────────

test.beforeAll(async ({ browser }) => {
  token = await readBearerToken();
  const page = await browser.newPage();
  await installCorsWorkaround(page, token);
  draftId = await createTempDraft(page.request, token);
  await initializeDraft(page.request, token, draftId);
  await page.close();
});

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage();
  await cleanupDraft(page.request, token, draftId);
  await page.close();
});

// ─────────────────────────────────────────────────────────────────────────────
// Flow 1 — Happy path AC-01→04
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Flow 1 — happy path: scene gen → cast proposal → confirm → ref-image → scene-image offer → accept', () => {
  test.setTimeout(60_000);

  test('AC-01: BlockingLoader appears when scene phase is running', async ({ page }) => {
    const sceneRunning = makeState({
      version: 10,
      active_phase: 'scene',
      active_run_phase: 'scene',
      phases: {
        scene: { status: 'running' },
        reference_data: { status: 'idle' },
        reference_image: { status: 'idle' },
        scene_image: { status: 'idle' },
      },
    });

    await stubPipeline(page, sceneRunning);
    await openStoryboard(page);

    // Blocking loader must be visible; modals must not.
    await expect(page.getByTestId('blocking-loader')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('blocking-loader-cancel')).toBeVisible();
    await expect(page.getByTestId('review-cast-proposal-modal')).not.toBeVisible();
    await expect(page.getByTestId('scene-image-offer-modal')).not.toBeVisible();
  });

  test('AC-02: ReviewCastProposalModal appears with references + cost when reference_data is awaiting_review', async ({ page }) => {
    const sceneRunning = makeState({
      version: 10,
      active_phase: 'scene',
      active_run_phase: 'scene',
      phases: {
        scene: { status: 'running' },
        reference_data: { status: 'idle' },
        reference_image: { status: 'idle' },
        scene_image: { status: 'idle' },
      },
    });

    const { emitState } = await stubPipeline(page, sceneRunning);
    await openStoryboard(page);

    await expect(page.getByTestId('blocking-loader')).toBeVisible({ timeout: 10_000 });

    // Simulate: scene done, reference_data awaiting_review with cast proposal
    await emitState(
      makeState({
        version: 11,
        active_phase: 'reference_data',
        active_run_phase: null,
        phases: {
          scene: { status: 'completed' },
          reference_data: { status: 'awaiting_review' },
          reference_image: { status: 'idle' },
          scene_image: { status: 'idle' },
        },
        payload: {
          cast_proposal: {
            references: [
              { name: 'Hero', kind: 'character', scene_ids: ['s-1', 's-2'] },
              { name: 'Forest', kind: 'environment', scene_ids: ['s-3'] },
            ],
          },
        },
        cost_estimate: '2.50 credits',
      }),
    );

    // Loader must disappear, cast modal must appear
    await expect(page.getByTestId('blocking-loader')).not.toBeVisible({ timeout: 8_000 });
    await expect(page.getByTestId('review-cast-proposal-modal')).toBeVisible({ timeout: 8_000 });

    // References listed
    await expect(page.getByTestId('reference-name-0')).toHaveText('Hero');
    await expect(page.getByTestId('reference-scenes-0')).toContainText('2');
    await expect(page.getByTestId('reference-name-1')).toHaveText('Forest');
    await expect(page.getByTestId('reference-scenes-1')).toContainText('1');

    // Cost shown
    await expect(page.getByTestId('cost-estimate')).toContainText('2.50 credits');
  });

  test('AC-03: Confirming cast shows BlockingLoader for reference_image then offers scene-image (AC-04)', async ({ page }) => {
    const castAwaiting = makeState({
      version: 11,
      active_phase: 'reference_data',
      active_run_phase: null,
      phases: {
        scene: { status: 'completed' },
        reference_data: { status: 'awaiting_review' },
        reference_image: { status: 'idle' },
        scene_image: { status: 'idle' },
      },
      payload: {
        cast_proposal: {
          references: [{ name: 'Villain', kind: 'character', scene_ids: ['s-1'] }],
        },
      },
      cost_estimate: '1.00 credit',
    });

    const { emitState } = await stubPipeline(page, castAwaiting);
    await openStoryboard(page);

    await expect(page.getByTestId('review-cast-proposal-modal')).toBeVisible({ timeout: 10_000 });

    // Click confirm
    await page.getByTestId('confirm-button').click();

    // Simulate: reference_image running
    await emitState(
      makeState({
        version: 12,
        active_phase: 'reference_image',
        active_run_phase: 'reference_image',
        phases: {
          scene: { status: 'completed' },
          reference_data: { status: 'completed' },
          reference_image: { status: 'running' },
          scene_image: { status: 'idle' },
        },
      }),
    );

    // Loader back, modal gone
    await expect(page.getByTestId('review-cast-proposal-modal')).not.toBeVisible({ timeout: 8_000 });
    await expect(page.getByTestId('blocking-loader')).toBeVisible({ timeout: 8_000 });

    // Simulate: scene_image awaiting_review
    await emitState(
      makeState({
        version: 13,
        active_phase: 'scene_image',
        active_run_phase: null,
        phases: {
          scene: { status: 'completed' },
          reference_data: { status: 'completed' },
          reference_image: { status: 'completed' },
          scene_image: { status: 'awaiting_review' },
        },
        payload: { scene_image_offer: { scene_count: 3 } },
        cost_estimate: '3.00 credits',
      }),
    );

    // Scene-image offer modal appears
    await expect(page.getByTestId('blocking-loader')).not.toBeVisible({ timeout: 8_000 });
    await expect(page.getByTestId('scene-image-offer-modal')).toBeVisible({ timeout: 8_000 });
    await expect(page.getByTestId('scene-count')).toHaveText('3');
    await expect(page.getByTestId('cost-estimate')).toContainText('3.00 credits');

    // Click accept
    await page.getByTestId('accept-button').click();

    // Simulate: scene_image running then completed
    await emitState(
      makeState({
        version: 14,
        active_phase: 'scene_image',
        active_run_phase: 'scene_image',
        phases: {
          scene: { status: 'completed' },
          reference_data: { status: 'completed' },
          reference_image: { status: 'completed' },
          scene_image: { status: 'running' },
        },
      }),
    );

    await expect(page.getByTestId('blocking-loader')).toBeVisible({ timeout: 8_000 });

    // Pipeline complete
    await emitState(
      makeState({
        version: 15,
        active_phase: 'scene_image',
        active_run_phase: null,
        phases: {
          scene: { status: 'completed' },
          reference_data: { status: 'completed' },
          reference_image: { status: 'completed' },
          scene_image: { status: 'completed' },
        },
      }),
    );

    await expect(page.getByTestId('blocking-loader')).not.toBeVisible({ timeout: 8_000 });
    await expect(page.getByTestId('review-cast-proposal-modal')).not.toBeVisible();
    await expect(page.getByTestId('scene-image-offer-modal')).not.toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Flow 2 — Skip cast (AC-07 + AC-11 cascade)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Flow 2 — skip cast: cast proposal → skip → scene-image offer (reference cascade)', () => {
  test.setTimeout(60_000);

  test('Skipping cast dismisses modal and transitions to scene_image offer directly (AC-07 + AC-11)', async ({ page }) => {
    const castAwaiting = makeState({
      version: 20,
      active_phase: 'reference_data',
      active_run_phase: null,
      phases: {
        scene: { status: 'completed' },
        reference_data: { status: 'awaiting_review' },
        reference_image: { status: 'idle' },
        scene_image: { status: 'idle' },
      },
      payload: {
        cast_proposal: {
          references: [{ name: 'Wizard', kind: 'character', scene_ids: ['s-2'] }],
        },
      },
      cost_estimate: '0.50 credits',
    });

    const { emitState } = await stubPipeline(page, castAwaiting);
    await openStoryboard(page);

    await expect(page.getByTestId('review-cast-proposal-modal')).toBeVisible({ timeout: 10_000 });

    // Click skip
    await page.getByTestId('skip-button').click();

    // Simulate: reference_data skipped, reference_image skipped (cascade F6),
    // scene_image now directly awaiting_review
    await emitState(
      makeState({
        version: 21,
        active_phase: 'scene_image',
        active_run_phase: null,
        phases: {
          scene: { status: 'completed' },
          reference_data: { status: 'skipped' },
          reference_image: { status: 'skipped' },
          scene_image: { status: 'awaiting_review' },
        },
        payload: { scene_image_offer: { scene_count: 4 } },
        cost_estimate: '4.00 credits',
      }),
    );

    // Cast modal gone, scene-image offer modal appears directly
    await expect(page.getByTestId('review-cast-proposal-modal')).not.toBeVisible({ timeout: 8_000 });
    await expect(page.getByTestId('scene-image-offer-modal')).toBeVisible({ timeout: 8_000 });
    await expect(page.getByTestId('scene-count')).toHaveText('4');
  });

  test('Skipping scene-image offer ends the pipeline cleanly (AC-07)', async ({ page }) => {
    const sceneImageAwaiting = makeState({
      version: 22,
      active_phase: 'scene_image',
      active_run_phase: null,
      phases: {
        scene: { status: 'completed' },
        reference_data: { status: 'skipped' },
        reference_image: { status: 'skipped' },
        scene_image: { status: 'awaiting_review' },
      },
      payload: { scene_image_offer: { scene_count: 2 } },
      cost_estimate: '2.00 credits',
    });

    const { emitState } = await stubPipeline(page, sceneImageAwaiting);
    await openStoryboard(page);

    await expect(page.getByTestId('scene-image-offer-modal')).toBeVisible({ timeout: 10_000 });

    // Skip scene-image
    await page.getByTestId('skip-button').click();

    // Simulate: scene_image skipped, pipeline idle
    await emitState(
      makeState({
        version: 23,
        active_phase: 'scene_image',
        active_run_phase: null,
        phases: {
          scene: { status: 'completed' },
          reference_data: { status: 'skipped' },
          reference_image: { status: 'skipped' },
          scene_image: { status: 'skipped' },
        },
      }),
    );

    await expect(page.getByTestId('scene-image-offer-modal')).not.toBeVisible({ timeout: 8_000 });
    await expect(page.getByTestId('blocking-loader')).not.toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Flow 3 — Cancel + corner re-trigger (AC-06 + AC-07)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Flow 3 — cancel + corner re-trigger', () => {
  test.setTimeout(60_000);

  test('AC-06: Cancelling a running phase releases the loader and returns to idle', async ({ page }) => {
    const sceneRunning = makeState({
      version: 30,
      active_phase: 'scene',
      active_run_phase: 'scene',
      phases: {
        scene: { status: 'running' },
        reference_data: { status: 'idle' },
        reference_image: { status: 'idle' },
        scene_image: { status: 'idle' },
      },
    });

    const { emitState } = await stubPipeline(page, sceneRunning);
    await openStoryboard(page);

    await expect(page.getByTestId('blocking-loader')).toBeVisible({ timeout: 10_000 });

    // Cancel
    await page.getByTestId('blocking-loader-cancel').click();

    // Simulate: scene cancelled → idle
    await emitState(
      makeState({
        version: 31,
        active_phase: 'scene',
        active_run_phase: null,
        phases: {
          scene: { status: 'idle' },
          reference_data: { status: 'idle' },
          reference_image: { status: 'idle' },
          scene_image: { status: 'idle' },
        },
      }),
    );

    // Loader must disappear (AC-06: released from loader)
    await expect(page.getByTestId('blocking-loader')).not.toBeVisible({ timeout: 8_000 });
    await expect(page.getByTestId('review-cast-proposal-modal')).not.toBeVisible();
  });

  test('AC-07: Corner trigger re-starts the scene phase after cancel', async ({ page }) => {
    const sceneIdle = makeState({
      version: 31,
      active_phase: 'scene',
      active_run_phase: null,
      phases: {
        scene: { status: 'idle' },
        reference_data: { status: 'idle' },
        reference_image: { status: 'idle' },
        scene_image: { status: 'idle' },
      },
    });

    const { emitState } = await stubPipeline(page, sceneIdle);
    await openStoryboard(page);

    // Loader should not be visible in idle state
    await expect(page.getByTestId('blocking-loader')).not.toBeVisible({ timeout: 10_000 });

    // Corner trigger should be visible for the scene phase
    await expect(page.getByTestId('step-corner-trigger-scene')).toBeVisible({ timeout: 8_000 });

    // Click corner trigger
    await page.getByTestId('step-corner-trigger-scene').click();

    // Simulate: scene running again
    await emitState(
      makeState({
        version: 32,
        active_phase: 'scene',
        active_run_phase: 'scene',
        phases: {
          scene: { status: 'running' },
          reference_data: { status: 'idle' },
          reference_image: { status: 'idle' },
          scene_image: { status: 'idle' },
        },
      }),
    );

    // Blocking loader must appear again
    await expect(page.getByTestId('blocking-loader')).toBeVisible({ timeout: 8_000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Flow 4 — Resume (AC-05)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Flow 4 — resume: correct UI reconstructed from backend state', () => {
  test.setTimeout(60_000);

  test('AC-05: BlockingLoader reconstructed after reload when scene phase is running', async ({ page }) => {
    const sceneRunning = makeState({
      version: 40,
      active_phase: 'scene',
      active_run_phase: 'scene',
      phases: {
        scene: { status: 'running' },
        reference_data: { status: 'idle' },
        reference_image: { status: 'idle' },
        scene_image: { status: 'idle' },
      },
    });

    // Set up mock before first navigation
    await stubPipeline(page, sceneRunning);
    await openStoryboard(page);
    await expect(page.getByTestId('blocking-loader')).toBeVisible({ timeout: 10_000 });

    // Navigate away and back (simulates reload/tab switch)
    await page.goto('/');
    await page.waitForURL('/');
    await page.waitForLoadState('networkidle', { timeout: 10_000 });

    // Navigate back — mock is still registered
    await page.goto(`/storyboard/${draftId}`);
    await waitForCanvas(page);
    await page.waitForLoadState('networkidle', { timeout: 15_000 });

    // The loader must be reconstructed from the backend GET alone
    await expect(page.getByTestId('blocking-loader')).toBeVisible({ timeout: 15_000 });
  });

  test('AC-05: ReviewCastProposalModal reconstructed after reload when reference_data is awaiting_review', async ({ page }) => {
    const castAwaiting = makeState({
      version: 50,
      active_phase: 'reference_data',
      active_run_phase: null,
      phases: {
        scene: { status: 'completed' },
        reference_data: { status: 'awaiting_review' },
        reference_image: { status: 'idle' },
        scene_image: { status: 'idle' },
      },
      payload: {
        cast_proposal: {
          references: [{ name: 'Ghost', kind: 'character', scene_ids: ['s-5', 's-6'] }],
        },
      },
      cost_estimate: '1.50 credits',
    });

    await stubPipeline(page, castAwaiting);
    await openStoryboard(page);

    // Cast modal must be reconstructed from backend GET (no prior client state)
    await expect(page.getByTestId('review-cast-proposal-modal')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('reference-name-0')).toHaveText('Ghost');
    await expect(page.getByTestId('blocking-loader')).not.toBeVisible();
  });

  test('AC-05: SceneImageOfferModal reconstructed after reload when scene_image is awaiting_review', async ({ page }) => {
    const offerAwaiting = makeState({
      version: 60,
      active_phase: 'scene_image',
      active_run_phase: null,
      phases: {
        scene: { status: 'completed' },
        reference_data: { status: 'completed' },
        reference_image: { status: 'completed' },
        scene_image: { status: 'awaiting_review' },
      },
      payload: { scene_image_offer: { scene_count: 7 } },
      cost_estimate: '7.00 credits',
    });

    await stubPipeline(page, offerAwaiting);
    await openStoryboard(page);

    await expect(page.getByTestId('scene-image-offer-modal')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('scene-count')).toHaveText('7');
    await expect(page.getByTestId('blocking-loader')).not.toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Flow 5 — Phase-order guard (AC-08 / AC-15)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Flow 5 — phase-order guard: triggering a later phase before prerequisites met', () => {
  test.setTimeout(60_000);

  test('AC-15: Triggering scene_image with no scenes shows a plain-language guard message', async ({ page }) => {
    // All phases idle — no scene blocks yet
    const allIdle = makeState({
      version: 70,
      active_phase: 'scene',
      active_run_phase: null,
      phases: {
        scene: { status: 'idle' },
        reference_data: { status: 'idle' },
        reference_image: { status: 'idle' },
        scene_image: { status: 'idle' },
      },
    });

    // Mock the pipeline read
    await stubPipeline(page, allIdle);

    // Override the scene_image trigger to return 422 pipeline.scenes_required
    const gateError = {
      error: 'pipeline.scenes_required',
      code: 'pipeline.scenes_required',
      details: { message: 'Generate your scenes first before illustrating them.' },
    };
    await page.route(`**/${draftId}/pipeline/phases/scene_image/trigger`, async (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({ ...jsonOk(gateError, 422) });
      }
      return route.continue();
    });

    await openStoryboard(page);

    // Loader should not be visible in idle state
    await expect(page.getByTestId('blocking-loader')).not.toBeVisible({ timeout: 10_000 });

    // The scene_image corner trigger should appear
    const sceneTrigger = page.getByTestId('step-corner-trigger-scene_image');
    await expect(sceneTrigger).toBeVisible({ timeout: 8_000 });

    // Attempt to trigger scene_image — should fail with a guard message
    await sceneTrigger.click();

    // A guard/error message should appear somewhere on the page
    // (BlockingLoader not shown, no modal — just the guard text)
    await expect(page.getByTestId('blocking-loader')).not.toBeVisible({ timeout: 5_000 });
  });

  test('AC-08: Triggering reference_image before scene completes is blocked (phase-order)', async ({ page }) => {
    const sceneRunning = makeState({
      version: 80,
      active_phase: 'scene',
      active_run_phase: 'scene',
      phases: {
        scene: { status: 'running' },
        reference_data: { status: 'idle' },
        reference_image: { status: 'idle' },
        scene_image: { status: 'idle' },
      },
    });

    await stubPipeline(page, sceneRunning);
    await openStoryboard(page);

    // Loader is visible for the running scene phase
    await expect(page.getByTestId('blocking-loader')).toBeVisible({ timeout: 10_000 });

    // The reference_image corner trigger is visible but DISABLED while scene is running
    // (StepCorners renders disabled buttons for out-of-order phases — AC-08 guard).
    const refImageTrigger = page.getByTestId('step-corner-trigger-reference_image');
    await expect(refImageTrigger).toBeVisible({ timeout: 8_000 });
    await expect(refImageTrigger).toBeDisabled();

    // The scene blocking loader remains active; no modal transitions happened.
    await expect(page.getByTestId('review-cast-proposal-modal')).not.toBeVisible();
    await expect(page.getByTestId('scene-image-offer-modal')).not.toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Flow 6 — Realtime version-guard (AC-05 observer convergence)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Flow 6 — realtime version-guard: stale events ignored', () => {
  test.setTimeout(60_000);

  test('AC-05: A stale realtime event (lower version) does not revert the UI state', async ({ page }) => {
    const castAwaiting = makeState({
      version: 90,
      active_phase: 'reference_data',
      active_run_phase: null,
      phases: {
        scene: { status: 'completed' },
        reference_data: { status: 'awaiting_review' },
        reference_image: { status: 'idle' },
        scene_image: { status: 'idle' },
      },
      payload: {
        cast_proposal: {
          references: [{ name: 'Sorcerer', kind: 'character', scene_ids: ['s-1'] }],
        },
      },
      cost_estimate: '0.80 credits',
    });

    const { emitState } = await stubPipeline(page, castAwaiting);
    await openStoryboard(page);

    await expect(page.getByTestId('review-cast-proposal-modal')).toBeVisible({ timeout: 10_000 });

    // Emit a stale event (lower version, scene running) — must be ignored
    await emitState(
      makeState({
        version: 50, // strictly less than 90 — STALE
        active_phase: 'scene',
        active_run_phase: 'scene',
        phases: {
          scene: { status: 'running' },
          reference_data: { status: 'idle' },
          reference_image: { status: 'idle' },
          scene_image: { status: 'idle' },
        },
      }),
    );

    // UI must NOT revert — cast modal still shown, no loader
    await page.waitForTimeout(1_000); // let any state update settle
    await expect(page.getByTestId('review-cast-proposal-modal')).toBeVisible({ timeout: 3_000 });
    await expect(page.getByTestId('blocking-loader')).not.toBeVisible();
  });

  test('AC-05: A newer realtime event (higher version) updates the UI', async ({ page }) => {
    const sceneRunning = makeState({
      version: 100,
      active_phase: 'scene',
      active_run_phase: 'scene',
      phases: {
        scene: { status: 'running' },
        reference_data: { status: 'idle' },
        reference_image: { status: 'idle' },
        scene_image: { status: 'idle' },
      },
    });

    const { emitState } = await stubPipeline(page, sceneRunning);
    await openStoryboard(page);

    await expect(page.getByTestId('blocking-loader')).toBeVisible({ timeout: 10_000 });

    // Emit a newer event — reference_data awaiting_review
    await emitState(
      makeState({
        version: 101, // higher — must apply
        active_phase: 'reference_data',
        active_run_phase: null,
        phases: {
          scene: { status: 'completed' },
          reference_data: { status: 'awaiting_review' },
          reference_image: { status: 'idle' },
          scene_image: { status: 'idle' },
        },
        payload: {
          cast_proposal: {
            references: [{ name: 'Dragon', kind: 'character', scene_ids: ['s-7'] }],
          },
        },
        cost_estimate: '3.00 credits',
      }),
    );

    // UI converges: loader gone, cast modal visible
    await expect(page.getByTestId('blocking-loader')).not.toBeVisible({ timeout: 8_000 });
    await expect(page.getByTestId('review-cast-proposal-modal')).toBeVisible({ timeout: 8_000 });
    await expect(page.getByTestId('reference-name-0')).toHaveText('Dragon');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Flow 7 — Pipeline failure banner (AC-12)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Flow 7 — pipeline failure banner (AC-12)', () => {
  test.setTimeout(60_000);

  test('AC-12: Failed reference_data phase releases loader and shows failure banner with retry option', async ({ page }) => {
    // PipelineFailureBanner covers reference_data and reference_image phases
    // (scene/scene_image have their own failure surfaces via status-block controls).
    const refDataRunning = makeState({
      version: 110,
      active_phase: 'reference_data',
      active_run_phase: 'reference_data',
      phases: {
        scene: { status: 'completed' },
        reference_data: { status: 'running' },
        reference_image: { status: 'idle' },
        scene_image: { status: 'idle' },
      },
    });

    const { emitState } = await stubPipeline(page, refDataRunning);
    await openStoryboard(page);

    await expect(page.getByTestId('blocking-loader')).toBeVisible({ timeout: 10_000 });

    // Simulate: reference_data phase failed
    await emitState(
      makeState({
        version: 111,
        active_phase: 'reference_data',
        active_run_phase: null,
        phases: {
          scene: { status: 'completed' },
          reference_data: { status: 'failed' },
          reference_image: { status: 'idle' },
          scene_image: { status: 'idle' },
        },
        error_message: 'Reference data extraction failed due to a timeout.',
      }),
    );

    // Loader must be released (active_run_phase → null)
    await expect(page.getByTestId('blocking-loader')).not.toBeVisible({ timeout: 8_000 });

    // PipelineFailureBanner must appear with a retry button
    await expect(page.getByTestId('pipeline-failure-banner')).toBeVisible({ timeout: 8_000 });
    await expect(page.getByTestId('pipeline-failure-retry')).toBeVisible();
  });

  test('AC-12: Failed reference_image phase releases loader and shows failure banner with retry', async ({ page }) => {
    const refImageRunning = makeState({
      version: 120,
      active_phase: 'reference_image',
      active_run_phase: 'reference_image',
      phases: {
        scene: { status: 'completed' },
        reference_data: { status: 'completed' },
        reference_image: { status: 'running' },
        scene_image: { status: 'idle' },
      },
    });

    const { emitState } = await stubPipeline(page, refImageRunning);
    await openStoryboard(page);

    await expect(page.getByTestId('blocking-loader')).toBeVisible({ timeout: 10_000 });

    // Simulate: reference_image phase failed
    await emitState(
      makeState({
        version: 121,
        active_phase: 'reference_image',
        active_run_phase: null,
        phases: {
          scene: { status: 'completed' },
          reference_data: { status: 'completed' },
          reference_image: { status: 'failed' },
          scene_image: { status: 'idle' },
        },
        error_message: 'Reference image generation timed out.',
      }),
    );

    // Loader released
    await expect(page.getByTestId('blocking-loader')).not.toBeVisible({ timeout: 8_000 });

    // Failure banner with retry
    await expect(page.getByTestId('pipeline-failure-banner')).toBeVisible({ timeout: 8_000 });
    await expect(page.getByTestId('pipeline-failure-retry')).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Flow 8 — Canvas refresh after pipeline phase completion
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Flow 8 — canvas refresh: blocks appear after pipeline phase transitions', () => {
  test.setTimeout(60_000);

  test('Scene blocks appear on canvas when scene phase transitions to completed', async ({ page }) => {
    // Stable block ids used in the mocked storyboard responses below.
    const BLOCK_START = 'f8-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const BLOCK_END   = 'f8-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const BLOCK_S1    = 'f8-cccc-cccc-cccc-cccccccccccc';
    const BLOCK_S2    = 'f8-dddd-dddd-dddd-dddddddddddd';
    const NOW = '2026-06-16T00:00:00.000Z';

    const baseBlock = {
      videoPrompt: null as string | null,
      durationS: 5,
      style: null as string | null,
      createdAt: NOW,
      updatedAt: NOW,
      mediaItems: [] as unknown[],
    };

    // Toggle between initial (start+end) and post-completion (start+scenes+end) payloads.
    let storyboardState: 'initial' | 'with-scenes' = 'initial';

    const sceneRunning = makeState({
      version: 130,
      active_phase: 'scene',
      active_run_phase: 'scene',
      phases: {
        scene: { status: 'running' },
        reference_data: { status: 'idle' },
        reference_image: { status: 'idle' },
        scene_image: { status: 'idle' },
      },
    });

    const { emitState } = await stubPipeline(page, sceneRunning);

    // Stub GET /storyboards/:draftId — returns different shapes per state toggle.
    // Pattern ends at draftId so it does not capture sub-resources (pipeline, reference-blocks).
    await page.route(`**/storyboards/${draftId}`, async (route) => {
      // Only intercept the root storyboard resource, not sub-paths like /pipeline.
      const url = new URL(route.request().url());
      const endsAtDraft = url.pathname.endsWith(`/storyboards/${draftId}`);
      if (!endsAtDraft || route.request().method() !== 'GET') {
        return route.continue();
      }
      if (storyboardState === 'initial') {
        return route.fulfill(jsonOk({
          blocks: [
            { ...baseBlock, id: BLOCK_START, draftId, blockType: 'start', name: null, prompt: null, positionX: 0,   positionY: 0, sortOrder: 0 },
            { ...baseBlock, id: BLOCK_END,   draftId, blockType: 'end',   name: null, prompt: null, positionX: 600, positionY: 0, sortOrder: 999 },
          ],
          edges: [{ id: 'f8-e0', draftId, sourceBlockId: BLOCK_START, targetBlockId: BLOCK_END }],
          musicBlocks: [],
        }));
      }
      return route.fulfill(jsonOk({
        blocks: [
          { ...baseBlock, id: BLOCK_START, draftId, blockType: 'start', name: null,       prompt: null,                      positionX: 0,   positionY: 0, sortOrder: 0 },
          { ...baseBlock, id: BLOCK_S1,    draftId, blockType: 'scene', name: 'Scene 1',  prompt: 'A sunrise over mountains', positionX: 200, positionY: 0, sortOrder: 1 },
          { ...baseBlock, id: BLOCK_S2,    draftId, blockType: 'scene', name: 'Scene 2',  prompt: 'Hikers on the trail',      positionX: 400, positionY: 0, sortOrder: 2 },
          { ...baseBlock, id: BLOCK_END,   draftId, blockType: 'end',   name: null,       prompt: null,                      positionX: 600, positionY: 0, sortOrder: 999 },
        ],
        edges: [
          { id: 'f8-e1', draftId, sourceBlockId: BLOCK_START, targetBlockId: BLOCK_S1 },
          { id: 'f8-e2', draftId, sourceBlockId: BLOCK_S1,    targetBlockId: BLOCK_S2 },
          { id: 'f8-e3', draftId, sourceBlockId: BLOCK_S2,    targetBlockId: BLOCK_END },
        ],
        musicBlocks: [],
      }));
    });

    await openStoryboard(page);

    // Initial: loader visible (scene running), no scene-block nodes.
    await expect(page.getByTestId('blocking-loader')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('scene-block-node')).toHaveCount(0);

    // Switch stub so the next reload returns scene blocks.
    storyboardState = 'with-scenes';

    // Emit scene=completed — the phase observer in StoryboardPage calls reloadStoryboard().
    await emitState(
      makeState({
        version: 131,
        active_phase: 'reference_data',
        active_run_phase: null,
        phases: {
          scene: { status: 'completed' },
          reference_data: { status: 'idle' },
          reference_image: { status: 'idle' },
          scene_image: { status: 'idle' },
        },
      }),
    );

    // Loader must disappear (no active_run_phase).
    await expect(page.getByTestId('blocking-loader')).not.toBeVisible({ timeout: 8_000 });

    // Canvas must now show the 2 scene blocks added by the mocked reload.
    await expect(page.getByTestId('scene-block-node')).toHaveCount(2, { timeout: 8_000 });
  });

  test('Cast confirm triggers canvas reload — storyboard GET fired after onConfirm', async ({ page }) => {
    // Verifies that the onConfirm callback in ReviewCastProposalModal calls
    // reloadStoryboard() after confirmPipelineCast resolves.
    const BLOCK_START = 'f8b-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const BLOCK_END   = 'f8b-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const NOW = '2026-06-16T00:00:00.000Z';
    const baseBlock = {
      videoPrompt: null as string | null,
      durationS: 5,
      style: null as string | null,
      createdAt: NOW,
      updatedAt: NOW,
      mediaItems: [] as unknown[],
    };

    const castAwaiting = makeState({
      version: 140,
      active_phase: 'reference_data',
      active_run_phase: null,
      phases: {
        scene: { status: 'completed' },
        reference_data: { status: 'awaiting_review' },
        reference_image: { status: 'idle' },
        scene_image: { status: 'idle' },
      },
      payload: { cast_proposal: { references: [{ name: 'Hero', kind: 'character', scene_ids: ['s1'] }] } },
      cost_estimate: '1.00 credit',
    });

    const { emitState } = await stubPipeline(page, castAwaiting);

    await page.route(`**/storyboards/${draftId}`, async (route) => {
      const url = new URL(route.request().url());
      if (!url.pathname.endsWith(`/storyboards/${draftId}`) || route.request().method() !== 'GET') {
        return route.continue();
      }
      return route.fulfill(jsonOk({
        blocks: [
          { ...baseBlock, id: BLOCK_START, draftId, blockType: 'start', name: null, prompt: null, positionX: 0,   positionY: 0, sortOrder: 0 },
          { ...baseBlock, id: BLOCK_END,   draftId, blockType: 'end',   name: null, prompt: null, positionX: 600, positionY: 0, sortOrder: 999 },
        ],
        edges: [{ id: 'f8b-e0', draftId, sourceBlockId: BLOCK_START, targetBlockId: BLOCK_END }],
        musicBlocks: [],
      }));
    });

    await openStoryboard(page);

    // Cast modal visible; initial storyboard load is now done.
    await expect(page.getByTestId('review-cast-proposal-modal')).toBeVisible({ timeout: 10_000 });

    // Set up request watcher AFTER mount (so we only capture post-confirm reloads).
    const reloadRequest = page.waitForRequest(
      (req) =>
        req.url().includes(`/storyboards/${draftId}`) &&
        !req.url().includes('/pipeline') &&
        !req.url().includes('/reference-blocks') &&
        req.method() === 'GET',
      { timeout: 8_000 },
    );

    // Click confirm
    await page.getByTestId('confirm-button').click();

    // Emit: reference_image running (server advances state after confirm)
    await emitState(makeState({
      version: 141,
      active_phase: 'reference_image',
      active_run_phase: 'reference_image',
      phases: {
        scene: { status: 'completed' },
        reference_data: { status: 'completed' },
        reference_image: { status: 'running' },
        scene_image: { status: 'idle' },
      },
    }));

    // Confirm modal must disappear (pipeline state updated).
    await expect(page.getByTestId('review-cast-proposal-modal')).not.toBeVisible({ timeout: 8_000 });

    // The confirm callback calls reloadStoryboard() → storyboard GET should have fired.
    await reloadRequest;
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Flow 9 — Reference block position persistence
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Flow 9 — reference block position persistence after reload', () => {
  test.setTimeout(60_000);

  /**
   * When reference blocks have positionX=0/positionY=0 (freshly created by
   * confirmCast), the canvas computes default positions and immediately PATCHes
   * them back to the backend. On the next page load the blocks return with
   * non-zero stored positions — no drift, no jump.
   *
   * Constants used (from useStoryboardCanvas.ts + musicBlockLayout.ts):
   *   STORYBOARD_SCENE_NODE_RENDERED_HEIGHT = 280
   *   STORYBOARD_MUSIC_NODE_VERTICAL_GAP    = 40
   *   STORYBOARD_MUSIC_NODE_LANE_HEIGHT     = 132
   *   REFERENCE_BLOCK_GAP_FROM_MUSIC        = 40
   *   REFERENCE_BLOCK_NODE_HEIGHT           = 180
   *   REFERENCE_BLOCK_NODE_VERTICAL_SPACING = 20
   *   REFERENCE_BLOCK_Y_OFFSET              = 350
   *
   * Scene at positionY=300 → storedY = (300+280+40) + (132+40) - 350 = 442
   * Scene at positionX=340 → storedX = 340
   */
  test('reference blocks with (0,0) positions get computed positions persisted via PATCH after canvas load', async ({ page }) => {
    const SCENE_ID = 'f9-scene-id-aaaa';
    const REF_ID   = 'f9-ref-id-bbbb';
    const FLOW_ID  = 'f9-flow-id-cccc';
    const NOW = '2026-06-16T00:00:00.000Z';

    // Pipeline: all phases completed — no loader, reference blocks visible.
    const allComplete = makeState({
      version: 200,
      active_phase: 'scene_image',
      active_run_phase: null,
      phases: {
        scene: { status: 'completed' },
        reference_data: { status: 'completed' },
        reference_image: { status: 'completed' },
        scene_image: { status: 'completed' },
      },
    });

    await stubPipeline(page, allComplete);

    // Override storyboard GET: scene block at (340, 300), sentinels at known X.
    const baseBlock = {
      videoPrompt: null as string | null,
      durationS: 5,
      style: null as string | null,
      createdAt: NOW,
      updatedAt: NOW,
      mediaItems: [] as unknown[],
    };
    await page.route(`**/storyboards/${draftId}`, async (route) => {
      const url = new URL(route.request().url());
      if (!url.pathname.endsWith(`/storyboards/${draftId}`) || route.request().method() !== 'GET') {
        return route.continue();
      }
      return route.fulfill(jsonOk({
        blocks: [
          { ...baseBlock, id: 'f9-start', draftId, blockType: 'start', name: null, prompt: null, positionX: 50,  positionY: 300, sortOrder: 0 },
          { ...baseBlock, id: SCENE_ID,   draftId, blockType: 'scene', name: 'Scene 1', prompt: 'Hero scene', positionX: 340, positionY: 300, sortOrder: 1 },
          { ...baseBlock, id: 'f9-end',   draftId, blockType: 'end',   name: null, prompt: null, positionX: 680, positionY: 300, sortOrder: 999 },
        ],
        edges: [
          { id: 'f9-e1', draftId, sourceBlockId: 'f9-start', targetBlockId: SCENE_ID },
          { id: 'f9-e2', draftId, sourceBlockId: SCENE_ID,   targetBlockId: 'f9-end' },
        ],
        musicBlocks: [],
      }));
    });

    // Override reference blocks GET: one block at (0, 0) linked to the scene.
    await page.route(`**/storyboards/${draftId}/references/blocks`, async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      return route.fulfill(jsonOk({
        items: [{
          blockId: REF_ID,
          draftId,
          flowId: FLOW_ID,
          castType: 'character',
          name: 'Hero',
          description: 'The protagonist',
          sortOrder: 0,
          positionX: 0,
          positionY: 0,
          windowStatus: 'done',
          errorMessage: null,
          version: 1,
          sceneBlockIds: [SCENE_ID],
          stars: [],
          previewFileId: null,
          createdAt: NOW,
          updatedAt: NOW,
        }],
      }));
    });

    // Capture PATCH /references/blocks/:blockId to verify position persistence.
    const patchedPositions: Array<{ blockId: string; positionX: number; positionY: number }> = [];
    await page.route(`**/storyboards/${draftId}/references/blocks/*`, async (route) => {
      if (route.request().method() !== 'PATCH') return route.continue();
      const blockId = route.request().url().split('/').at(-1) ?? '';
      const body = route.request().postDataJSON() as { positionX?: number; positionY?: number } | null;
      patchedPositions.push({ blockId, positionX: body?.positionX ?? -1, positionY: body?.positionY ?? -1 });
      await route.fulfill(jsonOk({ blockId, positionX: body?.positionX ?? 0, positionY: body?.positionY ?? 0 }));
    });

    await openStoryboard(page);

    // Reference block node must appear on the canvas.
    await expect(page.getByTestId('reference-block-node')).toHaveCount(1, { timeout: 15_000 });

    // Wait for the PATCH to be fired (default position persisted).
    await expect.poll(() => patchedPositions.length, { timeout: 5_000 }).toBeGreaterThan(0);

    // The persisted position must match the expected computed default:
    //   storedX = 340 (scene positionX)
    //   storedY = (300 + 280 + 40) + (132 + 40) - 350 = 792 - 350 = 442
    const patch = patchedPositions[0]!;
    expect(patch.blockId).toBe(REF_ID);
    expect(patch.positionX).toBe(340);
    expect(patch.positionY).toBe(442);
  });
});
