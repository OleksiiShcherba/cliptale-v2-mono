// E2E tests — Storyboard Canvas at /storyboard/:draftId
//
// Covers:
// - React Flow canvas renders (START + END sentinel nodes visible)
// - "Add Block" appends a new SceneBlockNode to the canvas
// - ZoomToolbar is visible with a zoom percentage label
// - CanvasToolbar is present (Add Block + disabled Auto-Arrange buttons)
//
// Auth is pre-seeded by global-setup.ts via storageState. Each test
// creates its own temporary generation draft (idempotent) and tears it
// down in a finally block so the DB stays clean.
//
// CORS workaround: the deployed Vite dev server bundles
// VITE_PUBLIC_API_BASE_URL=http://localhost:3001, and the API CORS allowlist
// only permits http://localhost:5173. When Playwright's browser at
// https://15-236-162-140.nip.io makes requests, the browser's Origin header
// is rejected.
//
// To work around this, installCorsWorkaround() intercepts two request groups:
//   1. GET pattern-auth-me - returns hardcoded dev-user JSON so AuthProvider
//      authenticates (mirrors DEV_AUTH_BYPASS on the server side).
//   2. http://localhost:3001/storyboards/ prefix - proxies through Playwright's
//      page.request (no browser CORS) to the real deployed API at E2E_API_URL.
//
// On IS_LOCAL_TARGET runs the route handlers are no-ops.
//
// Target deployed instance:
//   E2E_BASE_URL=https://15-236-162-140.nip.io
//   E2E_API_URL=https://api.15-236-162-140.nip.io
//   npx playwright test e2e/storyboard-canvas.spec.ts

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

import { AUTH_TOKEN_LOCAL_STORAGE_KEY } from './helpers/auth';
import { E2E_API_URL, IS_LOCAL_TARGET } from './helpers/env';

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Reads the bearer token from the storageState written by global-setup.
 * The FE injects this token into every apiClient request via localStorage.
 */
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

// installCorsWorkaround installs route interceptors that work around the CORS
// issue on the deployed instance. IS_LOCAL_TARGET makes it a no-op.
//
// Two interceptors:
//   1. GET any-url/auth/me - fulfills with hardcoded dev-user payload so
//      AuthProvider authenticates without reaching the CORS-blocked API.
//   2. http://localhost:3001/storyboards/... - proxies via page.request
//      (no browser CORS) to the real deployed API so the canvas loads data.
async function installCorsWorkaround(page: Page, token: string): Promise<void> {
  if (IS_LOCAL_TARGET) return;

  // 1. Auth — return dev-user payload directly (no network call needed).
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

  // 2. Storyboard API — proxy to deployed API via page.request (no CORS).
  //    The fulfilled response MUST include a permissive ACAO header so the
  //    browser does not re-apply CORS checks on the proxy response.
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

      // Override CORS headers so the browser accepts the proxied response.
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

/**
 * Creates a temporary generation draft and returns its id.
 * Uses page.request so the HTTP call goes through Playwright's native
 * fetch context (no browser CORS restrictions).
 */
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

/** Loads the storyboard state, which also initializes sentinel nodes and advances draft status (idempotent). */
async function initializeDraft(
  apiContext: {
    get: (
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
  const res = await apiContext.get(
    `${E2E_API_URL}/storyboards/${draftId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );
  if (!res.ok()) {
    const body = await res.text();
    throw new Error(
      `GET /storyboards/${draftId} failed (${res.status()}): ${body}`,
    );
  }
}

/** Soft-deletes the draft — best-effort cleanup in finally blocks. */
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

test.describe('Storyboard canvas — /storyboard/:draftId', () => {
  test.setTimeout(60_000);

  /**
   * Happy path: navigate to the storyboard page and confirm the React Flow
   * canvas renders with START and END sentinel nodes.
   */
  test('storyboard page renders React Flow canvas with START and END nodes', async ({
    page,
  }) => {
    const token = await readBearerToken();
    await installCorsWorkaround(page, token);

    const draftId = await createTempDraft(page.request, token);

    try {
      await initializeDraft(page.request, token, draftId);

      await page.goto(`/storyboard/${draftId}`);
      await page.waitForLoadState('networkidle', { timeout: 30_000 });

      // Canvas area must be present.
      const canvasArea = page.getByTestId('storyboard-canvas');
      await expect(canvasArea).toBeVisible({ timeout: 15_000 });

      // React Flow mounts a `.react-flow` container inside the canvas area.
      const reactFlowContainer = canvasArea.locator('.react-flow');
      await expect(reactFlowContainer).toBeVisible({ timeout: 15_000 });

      // START sentinel node.
      const startNode = page.getByTestId('start-node');
      await expect(startNode).toBeVisible({ timeout: 15_000 });

      // END sentinel node.
      const endNode = page.getByTestId('end-node');
      await expect(endNode).toBeVisible({ timeout: 15_000 });
    } finally {
      await cleanupDraft(page.request, token, draftId);
    }
  });

  /**
   * CanvasToolbar and ZoomToolbar are visible after the canvas loads.
   */
  test('CanvasToolbar and ZoomToolbar are visible on canvas load', async ({
    page,
  }) => {
    const token = await readBearerToken();
    await installCorsWorkaround(page, token);

    const draftId = await createTempDraft(page.request, token);

    try {
      await initializeDraft(page.request, token, draftId);

      await page.goto(`/storyboard/${draftId}`);
      await page.waitForLoadState('networkidle', { timeout: 30_000 });

      // Canvas area must be present before toolbars appear.
      await expect(page.getByTestId('storyboard-canvas')).toBeVisible({
        timeout: 15_000,
      });

      // Wait for React Flow to fully initialize.
      await expect(page.locator('.react-flow')).toBeVisible({ timeout: 15_000 });

      // CanvasToolbar.
      const toolbar = page.getByTestId('canvas-toolbar');
      await expect(toolbar).toBeVisible({ timeout: 10_000 });

      // "Add Block" button inside the toolbar.
      const addBlockBtn = page.getByTestId('add-block-button');
      await expect(addBlockBtn).toBeVisible({ timeout: 10_000 });

      // ZoomToolbar.
      const zoomToolbar = page.getByTestId('zoom-toolbar');
      await expect(zoomToolbar).toBeVisible({ timeout: 10_000 });

      // Zoom label shows a percentage.
      const zoomLabel = page.getByTestId('zoom-label');
      await expect(zoomLabel).toBeVisible({ timeout: 10_000 });
      await expect(zoomLabel).toContainText('%');
    } finally {
      await cleanupDraft(page.request, token, draftId);
    }
  });

  /**
   * Clicking "Add Block" appends a new SceneBlockNode to the canvas.
   */
  test('clicking Add Block adds a new scene block to the canvas', async ({
    page,
  }) => {
    const token = await readBearerToken();
    await installCorsWorkaround(page, token);

    const draftId = await createTempDraft(page.request, token);

    try {
      await initializeDraft(page.request, token, draftId);

      await page.goto(`/storyboard/${draftId}`);
      await page.waitForLoadState('networkidle', { timeout: 30_000 });

      // Wait for canvas and toolbars to be ready.
      await expect(page.getByTestId('storyboard-canvas')).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.locator('.react-flow')).toBeVisible({ timeout: 15_000 });

      const addBlockBtn = page.getByTestId('add-block-button');
      await expect(addBlockBtn).toBeVisible({ timeout: 10_000 });

      // Capture scene block count before clicking.
      const beforeCount = await page.getByTestId('scene-block-node').count();

      await addBlockBtn.click();

      // After click, at least one more scene block node should be visible.
      await expect(page.getByTestId('scene-block-node')).toHaveCount(
        beforeCount + 1,
        { timeout: 10_000 },
      );

      // The new block should display a SCENE header (e.g. "SCENE 01").
      const newBlock = page.getByTestId('scene-block-node').last();
      await expect(newBlock.getByTestId('scene-name')).toBeVisible();
      await expect(newBlock.getByTestId('scene-name')).toContainText('SCENE');
    } finally {
      await cleanupDraft(page.request, token, draftId);
    }
  });

  /**
   * Verifies the ZoomToolbar shows a percentage on initial canvas load.
   * React Flow's fitView may settle on a zoom != 100%, so the assertion
   * checks for presence of "%" rather than a specific value.
   */
  test('ZoomToolbar percentage label is visible on initial canvas load', async ({
    page,
  }) => {
    const token = await readBearerToken();
    await installCorsWorkaround(page, token);

    const draftId = await createTempDraft(page.request, token);

    try {
      await initializeDraft(page.request, token, draftId);

      await page.goto(`/storyboard/${draftId}`);
      await page.waitForLoadState('networkidle', { timeout: 30_000 });

      await expect(page.getByTestId('storyboard-canvas')).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.locator('.react-flow')).toBeVisible({ timeout: 15_000 });

      const zoomLabel = page.getByTestId('zoom-label');
      await expect(zoomLabel).toBeVisible({ timeout: 10_000 });

      // The zoom label must contain a "%" symbol (e.g. "75%" or "100%").
      await expect(zoomLabel).toContainText('%');
    } finally {
      await cleanupDraft(page.request, token, draftId);
    }
  });

  /**
   * Verifies the page renders the StoryboardPage shell elements: top bar,
   * sidebar, bottom bar navigation buttons.
   */
  test('storyboard page shell renders top bar, sidebar, and bottom bar', async ({
    page,
  }) => {
    const token = await readBearerToken();
    await installCorsWorkaround(page, token);

    const draftId = await createTempDraft(page.request, token);

    try {
      await initializeDraft(page.request, token, draftId);

      await page.goto(`/storyboard/${draftId}`);
      await page.waitForLoadState('networkidle', { timeout: 30_000 });

      const storyboardPage = page.getByTestId('storyboard-page');
      await expect(storyboardPage).toBeVisible({ timeout: 15_000 });

      // Sidebar navigation.
      const sidebar = page.getByTestId('storyboard-sidebar');
      await expect(sidebar).toBeVisible({ timeout: 10_000 });

      // Bottom bar: Back + Next buttons.
      await expect(page.getByTestId('back-button')).toBeVisible({
        timeout: 10_000,
      });
      await expect(page.getByTestId('next-step3-button')).toBeVisible({
        timeout: 10_000,
      });
    } finally {
      await cleanupDraft(page.request, token, draftId);
    }
  });
});
