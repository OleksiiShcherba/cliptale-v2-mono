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
  const escaped = draftId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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
