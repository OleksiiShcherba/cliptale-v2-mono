// E2E tests — Storyboard drag interaction at /storyboard/:draftId
//
// Covers:
// - Dragging a SceneBlockNode does NOT crash the page (error boundary is never shown)
// - After a drag the canvas is still interactive (scene block visible)
//
// Pattern mirrors storyboard-canvas.spec.ts:
//   - Auth token from storageState written by global-setup
//   - Draft created via page.request (no browser CORS) and torn down in finally
//   - installCorsWorkaround() routes auth/me + storyboard API calls through
//     page.request to bypass the deployed-instance CORS restriction
//
// This test was added to reproduce and guard against the production crash:
//   useStoryboardDrag.ts line 161 — "Cannot read properties of undefined
//   (reading 'clientX')" — caused by accessing event.nativeEvent on a raw
//   DOM event passed by React Flow v12's d3-drag internals.

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

import { AUTH_TOKEN_LOCAL_STORAGE_KEY } from './helpers/auth';
import { E2E_API_URL, IS_LOCAL_TARGET } from './helpers/env';

// ── Helpers (same pattern as storyboard-canvas.spec.ts) ───────────────────────

async function readBearerToken(): Promise<string> {
  const statePath = path.resolve(
    __dirname,
    '../test-results/e2e-auth-state.json',
  );
  const raw = await fs.readFile(statePath, 'utf-8');
  const state = JSON.parse(raw) as {
    origins?: Array<{
      localStorage?: Array<{ name: string; value: string }>;
    }>;
  };
  for (const origin of state.origins ?? []) {
    const entry = origin.localStorage?.find(
      (e) => e.name === AUTH_TOKEN_LOCAL_STORAGE_KEY,
    );
    if (entry?.value) return entry.value;
  }
  throw new Error(
    'auth_token not found in storageState — ensure globalSetup ran.',
  );
}

async function installCorsWorkaround(page: Page, token: string): Promise<void> {
  if (IS_LOCAL_TARGET) return;

  await page.route('**/auth/me', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          userId: 'dev-user-001',
          email: 'dev@cliptale.local',
          displayName: 'Dev User',
        }),
      });
    }
    return route.continue();
  });

  await page.route('http://localhost:3001/storyboards/**', async (route) => {
    const original = route.request();
    const rewrittenUrl = original.url().replace(
      'http://localhost:3001',
      E2E_API_URL,
    );

    try {
      const postData = original.postDataBuffer();
      const proxyRes = await page.request.fetch(rewrittenUrl, {
        method: original.method(),
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        ...(postData && postData.length > 0 ? { data: postData } : {}),
      });

      const proxyHeaders = {
        ...proxyRes.headers(),
        'access-control-allow-origin': '*',
        'access-control-allow-credentials': 'true',
      };

      await route.fulfill({
        status: proxyRes.status(),
        headers: proxyHeaders,
        body: await proxyRes.body(),
      });
    } catch {
      await route.continue().catch(() => {/* ignore */});
    }
  });
}

async function createTempDraft(
  apiContext: {
    post: (
      url: string,
      opts: object,
    ) => Promise<{
      ok: () => boolean;
      json: () => Promise<unknown>;
      status: () => number;
      text: () => Promise<string>;
    }>;
  },
  token: string,
): Promise<string> {
  const res = await apiContext.post(`${E2E_API_URL}/generation-drafts`, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    data: { promptDoc: { schemaVersion: 1, blocks: [] } },
  });
  if (!res.ok()) {
    const body = await res.text();
    throw new Error(
      `Failed to create test draft (${res.status()}): ${body}`,
    );
  }
  const data = (await res.json()) as { id?: string };
  if (!data.id) throw new Error('Draft creation response missing id field');
  return data.id;
}

async function initializeDraft(
  apiContext: {
    post: (
      url: string,
      opts: object,
    ) => Promise<{
      ok: () => boolean;
      status: () => number;
      text: () => Promise<string>;
    }>;
  },
  token: string,
  draftId: string,
): Promise<void> {
  const res = await apiContext.post(
    `${E2E_API_URL}/storyboards/${draftId}/initialize`,
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      data: {},
    },
  );
  if (!res.ok()) {
    const body = await res.text();
    throw new Error(
      `POST /storyboards/${draftId}/initialize failed (${res.status()}): ${body}`,
    );
  }
}

async function cleanupDraft(
  apiContext: {
    delete: (url: string, opts: object) => Promise<unknown>;
  },
  token: string,
  draftId: string,
): Promise<void> {
  await apiContext
    .delete(`${E2E_API_URL}/generation-drafts/${draftId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    .catch(() => {
      /* best-effort */
    });
}

// ── Test suite ─────────────────────────────────────────────────────────────────

test.describe('Storyboard drag — /storyboard/:draftId', () => {
  test.setTimeout(90_000);

  /**
   * Regression test for: "Cannot read properties of undefined (reading
   * 'clientX')" in useStoryboardDrag.ts.
   *
   * Steps:
   * 1. Navigate to a storyboard page (draft with START+END nodes).
   * 2. Click "Add Block" so there is a SCENE block to drag.
   * 3. Perform a mouse drag on the scene block node.
   * 4. Assert the page did NOT crash: storyboard-page test id is still
   *    visible and canvas-error is not present.
   */
  test('dragging a scene block does not crash the page', async ({ page }) => {
    const token = await readBearerToken();
    await installCorsWorkaround(page, token);

    const draftId = await createTempDraft(page.request, token);

    try {
      await initializeDraft(page.request, token, draftId);

      await page.goto(`/storyboard/${draftId}`);
      await page.waitForLoadState('networkidle', { timeout: 30_000 });

      // Canvas must be visible before we interact.
      await expect(page.getByTestId('storyboard-canvas')).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.locator('.react-flow')).toBeVisible({ timeout: 15_000 });

      // Add a scene block so there is something draggable.
      const addBlockBtn = page.getByTestId('add-block-button');
      await expect(addBlockBtn).toBeVisible({ timeout: 10_000 });
      await addBlockBtn.click();

      // Wait for the new block to appear.
      const sceneBlock = page.getByTestId('scene-block-node').first();
      await expect(sceneBlock).toBeVisible({ timeout: 10_000 });

      // Perform a drag on the scene block.
      // We drag by a small delta (50 px right, 30 px down) — just enough to
      // exercise the onNodeDrag handler without relying on any specific canvas
      // position.
      const blockBoundingBox = await sceneBlock.boundingBox();
      if (blockBoundingBox) {
        const startX = blockBoundingBox.x + blockBoundingBox.width / 2;
        const startY = blockBoundingBox.y + blockBoundingBox.height / 2;

        await page.mouse.move(startX, startY);
        await page.mouse.down();
        // Move in small steps to trigger intermediate onNodeDrag events.
        await page.mouse.move(startX + 10, startY + 5, { steps: 5 });
        await page.mouse.move(startX + 30, startY + 15, { steps: 5 });
        await page.mouse.move(startX + 50, startY + 30, { steps: 5 });
        await page.mouse.up();
      }

      // Allow any React state updates to settle.
      await page.waitForTimeout(500);

      // The storyboard page must still be mounted — if the crash occurred,
      // React Router's default error UI would replace this.
      await expect(page.getByTestId('storyboard-page')).toBeVisible({
        timeout: 5_000,
      });

      // The canvas-error placeholder must not be visible (used by
      // StoryboardPage when storyboard data fails to load).
      await expect(page.getByTestId('canvas-error')).not.toBeVisible();

      // The scene block is still present after the drag (canvas operational).
      await expect(page.getByTestId('scene-block-node').first()).toBeVisible({
        timeout: 5_000,
      });
    } finally {
      await cleanupDraft(page.request, token, draftId);
    }
  });
});
