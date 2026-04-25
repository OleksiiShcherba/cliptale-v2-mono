// E2E tests — Storyboard autosave on drag-end at /storyboard/:draftId
//
// Covers:
// - After dragging a scene block, a PUT /storyboards/:draftId fires within 3 s.
//
// Pattern mirrors storyboard-drag.spec.ts:
//   - Auth token from storageState written by global-setup
//   - Draft created via page.request (no browser CORS) and torn down in finally
//   - installCorsWorkaround() routes auth/me + storyboard API calls through
//     page.request to bypass the deployed-instance CORS restriction
//   - CORS workaround adds `access-control-allow-origin: *` to fulfilled responses
//     so the browser does not block them (see feedback_playwright_cors_proxy.md)

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

import { AUTH_TOKEN_LOCAL_STORAGE_KEY } from './helpers/auth';
import { E2E_API_URL, IS_LOCAL_TARGET } from './helpers/env';

// ── Helpers (same pattern as storyboard-drag.spec.ts) ─────────────────────────

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

      // Must set CORS headers on fulfilled response — the browser still evaluates
      // them even when Playwright intercepts the request (see feedback_playwright_cors_proxy.md).
      await route.fulfill({
        status: proxyRes.status(),
        headers: {
          ...proxyRes.headers(),
          'access-control-allow-origin': '*',
          'access-control-allow-credentials': 'true',
        },
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

test.describe('Storyboard autosave fixes — /storyboard/:draftId', () => {
  test.setTimeout(90_000);

  /**
   * Verifies that dragging a scene block triggers a PUT /storyboards/:draftId
   * within 3 seconds of drag-end (via the immediate setTimeout(() => void saveNow(), 0)
   * path added to handleNodesChange).
   *
   * The 3 s window accommodates:
   *   - React event processing + setTimeout(fn, 0) macro-task
   *   - useEffect([nodes]) running to update nodesRef.current
   *   - The HTTP round-trip to PUT /storyboards/:draftId
   */
  test('drag-end triggers PUT /storyboards/:draftId within 3 s', async ({ page }) => {
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

      // Add a scene block so there is a draggable node.
      const addBlockBtn = page.getByTestId('add-block-button');
      await expect(addBlockBtn).toBeVisible({ timeout: 10_000 });
      await addBlockBtn.click();

      // Wait for the new block to appear.
      const sceneBlock = page.getByTestId('scene-block-node').first();
      await expect(sceneBlock).toBeVisible({ timeout: 10_000 });

      // Start waiting for the PUT before performing the drag so we don't miss it.
      const putRequestPromise = page.waitForRequest(
        (req) =>
          req.method() === 'PUT' &&
          (req.url().includes('/storyboards/') || req.url().includes(`storyboards/${draftId}`)),
        { timeout: 8_000 },
      );

      // Perform a mouse drag on the scene block.
      const blockBoundingBox = await sceneBlock.boundingBox();
      if (blockBoundingBox) {
        const startX = blockBoundingBox.x + blockBoundingBox.width / 2;
        const startY = blockBoundingBox.y + blockBoundingBox.height / 2;

        await page.mouse.move(startX, startY);
        await page.mouse.down();
        await page.mouse.move(startX + 10, startY + 5, { steps: 5 });
        await page.mouse.move(startX + 50, startY + 30, { steps: 5 });
        await page.mouse.up();
      }

      // Assert that the PUT request fired within 3 s of drag-end.
      // waitForRequest was set up before the drag, so it only needs to resolve.
      const putRequest = await putRequestPromise;
      expect(putRequest.url()).toMatch(/storyboards\//);
      expect(putRequest.method()).toBe('PUT');

      // Storyboard page must still be mounted (no crash).
      await expect(page.getByTestId('storyboard-page')).toBeVisible({
        timeout: 5_000,
      });
    } finally {
      await cleanupDraft(page.request, token, draftId);
    }
  });
});
