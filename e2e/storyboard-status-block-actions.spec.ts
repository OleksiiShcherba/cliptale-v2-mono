// E2E — storyboard status-block actions (Regenerate safety + keyboard a11y)
//
// Covers the quality gates that only a real browser can prove:
//   • QG-1 / AC-05 — the destructive scene Regenerate ALWAYS shows the
//     loss-enumerating warning BEFORE any scene-plan generation starts; a
//     cancel runs nothing.
//   • AC-01 / AC-07 — confirming leaves the completed state at once and starts
//     exactly one additional generation.
//   • QG-2 — the kebab status menu is fully keyboard-operable (focus → Enter
//     opens → Escape closes, items reachable) with the correct ARIA roles.
//
// AC-09's non-owner DOM-absence is exhaustively covered at the component /
// integration layer (StoryboardStatusMenu, StoryboardPlanControls,
// StoryboardPageWorkspace tests); here we assert the positive owner case.
//
// The scene-plan lifecycle is mocked at the network boundary (the FE auto-starts
// a plan on load and polls it), so no real generation runs — the unit under
// test is the UI transition, not the generation backend it reuses unchanged.
// The first start (auto-start) drives the block to its completed state; the
// Regenerate confirm fires a second start, which we count via the mock.
//
// A full @axe-core/playwright scan is a recommended follow-up (the dependency is
// not yet installed); the structural a11y assertions below cover QG-2.
//
//   npm run e2e -- storyboard-status-block-actions.spec.ts

import { test, expect } from '@playwright/test';
import type { Page, Route } from '@playwright/test';

import { emitMockRealtimeEvent, installMockRealtime } from './helpers/mock-realtime';
import {
  cleanupDraft,
  createTempDraft,
  initializeDraft,
  readAuthenticatedUserId,
  readBearerToken,
  waitForCanvas,
  type StoryboardPlanSeed,
} from './helpers/storyboard';

const PLAN_JOB_ID = 'e2e-status-menu-plan-job';

function planSeed(): StoryboardPlanSeed {
  return {
    schemaVersion: 1,
    videoLengthSeconds: 10,
    sceneCount: 1,
    scenes: [
      {
        sceneNumber: 1,
        prompt: 'E2E scene',
        visualPrompt: 'E2E visual',
        durationSeconds: 10,
        referencedMedia: [],
        transitionNotes: '',
        style: 'cinematic',
      },
    ],
  };
}

function block(
  draftId: string,
  id: string,
  blockType: 'start' | 'scene' | 'end',
  sortOrder: number,
) {
  const now = '2026-05-30T00:00:00.000Z';
  return {
    id,
    draftId,
    blockType,
    name: blockType === 'scene' ? 'Scene 1' : null,
    prompt: blockType === 'scene' ? 'E2E scene' : null,
    videoPrompt: null,
    durationS: blockType === 'scene' ? 10 : 0,
    positionX: sortOrder * 220,
    positionY: 0,
    sortOrder,
    style: blockType === 'scene' ? 'cinematic' : null,
    createdAt: now,
    updatedAt: now,
    mediaItems: [],
  };
}

/** A minimal applied storyboard state with the START/END sentinels + one scene. */
function appliedStoryboardState(draftId: string) {
  return {
    blocks: [
      block(draftId, 'start-block', 'start', 0),
      block(draftId, 'scene-block-1', 'scene', 1),
      block(draftId, 'end-block', 'end', 2),
    ],
    edges: [],
    musicBlocks: [],
  };
}

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

/**
 * Mocks the scene-plan lifecycle so the block reaches "completed" deterministically
 * and the Regenerate start is counted. Returns startCount(): the number of
 * plan-start POSTs seen (1 = the on-load auto-start; 2 = after a Regenerate).
 * While startCount === 1 the GET poll reports completed; once a Regenerate has
 * fired (startCount >= 2) it reports running, so the block leaves completed.
 */
async function installScenePlanLifecycle(
  page: Page,
  params: { token: string; draftId: string; plan: StoryboardPlanSeed },
): Promise<{ startCount: () => number }> {
  let startCount = 0;
  await page.route('**/*', async (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const planPath = `/generation-drafts/${params.draftId}/storyboard-plan`;

    if (request.method() === 'POST' && path === planPath) {
      startCount += 1;
      await route.fulfill(jsonResponse({ jobId: PLAN_JOB_ID, status: 'queued' }, 202));
      return;
    }

    if (request.method() === 'GET' && path === `${planPath}/${PLAN_JOB_ID}`) {
      const completed = startCount <= 1;
      await route.fulfill(
        jsonResponse({
          jobId: PLAN_JOB_ID,
          status: completed ? 'completed' : 'running',
          plan: completed ? params.plan : null,
          errorMessage: null,
        }),
      );
      return;
    }

    if (request.method() === 'POST' && path === `/storyboards/${params.draftId}/apply-latest-plan`) {
      // Apply a deterministic canvas state (START → scene → END) so the block
      // reaches its completed state without depending on the generation backend.
      await route.fulfill(jsonResponse(appliedStoryboardState(params.draftId)));
      return;
    }

    await route.fallback();
  });
  return { startCount: () => startCount };
}

async function gotoCompletedScenePlan(
  page: Page,
): Promise<{ draftId: string; token: string; startCount: () => number }> {
  const token = await readBearerToken();
  const draftId = await createTempDraft(page.request, token);
  const userId = await readAuthenticatedUserId(page.request, token);
  await initializeDraft(page.request, token, draftId);

  // Completion is delivered over the realtime socket (the FE does not interval-poll),
  // so mock the socket and the start/apply endpoints.
  await installMockRealtime(page);
  const lifecycle = await installScenePlanLifecycle(page, { token, draftId, plan: planSeed() });
  await page.goto(`/storyboard/${draftId}`);
  await waitForCanvas(page);

  // Wait for the on-load auto-start (jobId now set on the FE), then drive the
  // plan to completed via a realtime event.
  await expect.poll(() => lifecycle.startCount(), { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
  await emitMockRealtimeEvent(page, {
    type: 'storyboard.status.updated',
    userId,
    draftId,
    payload: { resource: 'storyboardPlan', jobId: PLAN_JOB_ID, status: 'completed' },
  });

  const planControls = page.getByTestId('storyboard-plan-controls');
  await expect(planControls).toBeVisible({ timeout: 15_000 });
  await expect(planControls.getByText('Generated scenes applied')).toBeVisible({ timeout: 20_000 });
  return { draftId, token, startCount: lifecycle.startCount };
}

test.describe('storyboard status-block actions', () => {
  test.setTimeout(90_000);

  test('the loss warning always precedes scene regeneration, and cancel runs nothing (QG-1, AC-05, AC-01, AC-07)', async ({ page }) => {
    const { draftId, token, startCount } = await gotoCompletedScenePlan(page);
    try {
      const planControls = page.getByTestId('storyboard-plan-controls');
      const trigger = planControls.getByTestId('storyboard-status-menu-trigger');

      // Owner sees the kebab (AC-09 positive control). One start so far (auto-start).
      await expect(trigger).toBeVisible();
      const baseline = startCount();

      // Open menu → Regenerate → the warning appears BEFORE any new start fires.
      await trigger.click();
      await page.getByTestId('storyboard-status-menu-regenerate').click();
      await expect(page.getByTestId('storyboard-regenerate-modal')).toBeVisible();
      expect(startCount()).toBe(baseline);

      // Cancel → no new generation, modal closed (AC-05).
      await page.getByTestId('storyboard-regenerate-cancel-button').click();
      await expect(page.getByTestId('storyboard-regenerate-modal')).toHaveCount(0);
      expect(startCount()).toBe(baseline);

      // Reopen → Regenerate → Confirm → exactly one new start; the block leaves
      // the completed state at once so its kebab is gone (AC-01, AC-07).
      await trigger.click();
      await page.getByTestId('storyboard-status-menu-regenerate').click();
      await page.getByTestId('storyboard-regenerate-confirm-button').click();
      await expect(page.getByTestId('storyboard-regenerate-modal')).toHaveCount(0);
      await expect.poll(() => startCount()).toBe(baseline + 1);
      await expect(planControls.getByTestId('storyboard-status-menu-trigger')).toHaveCount(0);
    } finally {
      await cleanupDraft(page.request, token, draftId);
    }
  });

  test('the kebab status menu is fully keyboard-operable (QG-2)', async ({ page }) => {
    const { draftId, token } = await gotoCompletedScenePlan(page);
    try {
      const planControls = page.getByTestId('storyboard-plan-controls');
      const trigger = planControls.getByTestId('storyboard-status-menu-trigger');

      // Correct ARIA contract on the trigger.
      await expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
      await expect(trigger).toHaveAttribute('aria-expanded', 'false');

      // Reachable + operable by keyboard: focus, open with Enter.
      await trigger.focus();
      await expect(trigger).toBeFocused();
      await page.keyboard.press('Enter');

      const menu = page.getByTestId('storyboard-status-menu');
      await expect(menu).toBeVisible();
      await expect(menu).toHaveAttribute('role', 'menu');
      await expect(trigger).toHaveAttribute('aria-expanded', 'true');
      await expect(page.getByTestId('storyboard-status-menu-regenerate')).toHaveAttribute('role', 'menuitem');
      await expect(page.getByTestId('storyboard-status-menu-hide')).toHaveAttribute('role', 'menuitem');

      // Escape closes and returns focus to the trigger.
      await page.keyboard.press('Escape');
      await expect(menu).toHaveCount(0);
      await expect(trigger).toBeFocused();
    } finally {
      await cleanupDraft(page.request, token, draftId);
    }
  });
});
