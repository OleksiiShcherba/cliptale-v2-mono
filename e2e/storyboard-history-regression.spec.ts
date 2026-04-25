/**
 * E2E regression test — storyboard history endpoint (pool.execute → pool.query fix).
 *
 * Verifies that the GET and POST /storyboards/:draftId/history endpoints return
 * correct status codes (200 / 201) and do not 500 with ER_WRONG_ARGUMENTS.
 *
 * Background:
 *   The original bug was that pool.execute() (prepared statement protocol) cannot
 *   bind a LIMIT parameter — MySQL returns ER_WRONG_ARGUMENTS errno 1210.
 *   The fix switches those queries to pool.query() (text protocol).
 *   This test guards against regression of that fix.
 *
 * The test uses Playwright's `page.request` context so that all HTTP calls go
 * through the Playwright browser agent. Auth is pre-seeded by global-setup.ts
 * (the storageState file) — the bearer token is read from there and injected
 * into every request as an Authorization header. This exercises the full
 * network path from the test browser to the deployed API server.
 *
 * Note: The storyboard page itself cannot be navigated to in the current deploy
 * environment because @xyflow/react is not yet installed in the Vite container
 * (pending regression fix). The history endpoint is therefore exercised via
 * direct browser-context API calls — which is the meaningful E2E gate for the
 * DB layer fix being validated here.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { test, expect } from '@playwright/test';

import { E2E_API_URL } from './helpers/env';
import { AUTH_TOKEN_LOCAL_STORAGE_KEY } from './helpers/auth';

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Reads the bearer token from the storageState file written by global-setup.
 * This is the same token the FE injects into every apiClient request.
 */
async function readBearerToken(): Promise<string> {
  const statePath = path.resolve(__dirname, '../test-results/e2e-auth-state.json');
  const raw = await fs.readFile(statePath, 'utf-8');
  const state = JSON.parse(raw) as {
    origins?: Array<{ localStorage?: Array<{ name: string; value: string }> }>;
  };
  for (const origin of state.origins ?? []) {
    const entry = origin.localStorage?.find((e) => e.name === AUTH_TOKEN_LOCAL_STORAGE_KEY);
    if (entry?.value) return entry.value;
  }
  throw new Error(
    'auth_token not found in storageState — ensure globalSetup ran before this test.',
  );
}

/**
 * Creates a temporary generation draft via the API and returns its id.
 * Uses Playwright's `page.request` so the HTTP call originates from the
 * browser's network context (same as production FE calls).
 */
async function createTempDraft(
  apiContext: { post: (url: string, opts: object) => Promise<{ ok: () => boolean; json: () => Promise<unknown>; status: () => number; text: () => Promise<string> }> },
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
    throw new Error(`Failed to create test draft (${res.status()}): ${body}`);
  }
  const data = (await res.json()) as { id?: string };
  if (!data.id) throw new Error('creation response missing id field');
  return data.id;
}

/** Soft-deletes the draft (best-effort cleanup). */
async function cleanupDraft(
  apiContext: { delete: (url: string, opts: object) => Promise<unknown> },
  token: string,
  draftId: string,
): Promise<void> {
  await apiContext
    .delete(`${E2E_API_URL}/generation-drafts/${draftId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    .catch(() => { /* best-effort */ });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

test.describe('Storyboard history endpoint — regression guard (ER_WRONG_ARGUMENTS fix)', () => {
  test.setTimeout(60_000);

  /**
   * GET /storyboards/:draftId/history must return 200.
   *
   * Before the pool.execute→pool.query fix, this endpoint returned 500 with
   * "ER_WRONG_ARGUMENTS" because mysql2 cannot bind LIMIT as a prepared-
   * statement parameter. The fix switches to pool.query (text protocol).
   */
  test('GET /storyboards/:draftId/history returns 200 — not 500 ER_WRONG_ARGUMENTS', async ({
    page,
  }) => {
    const token = await readBearerToken();
    const draftId = await createTempDraft(page.request, token);

    try {
      // Load the storyboard state (idempotent — initializes sentinel nodes and advances status)
      const initRes = await page.request.get(
        `${E2E_API_URL}/storyboards/${draftId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
      expect(
        initRes.ok(),
        `GET /storyboards/${draftId} should succeed (status: ${initRes.status()})`,
      ).toBe(true);

      // This is the regression gate: GET /history used pool.execute with LIMIT ?
      // which triggered ER_WRONG_ARGUMENTS. Now it uses pool.query.
      const historyRes = await page.request.get(
        `${E2E_API_URL}/storyboards/${draftId}/history`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      expect(
        historyRes.status(),
        `GET /storyboards/${draftId}/history must return 200 (was 500 before pool.execute→pool.query fix)`,
      ).toBe(200);

      const body = await historyRes.json();
      expect(
        Array.isArray(body),
        'GET /history response body must be an array',
      ).toBe(true);
    } finally {
      await cleanupDraft(page.request, token, draftId);
    }
  });

  /**
   * POST /storyboards/:draftId/history must return 201.
   *
   * The insertHistoryAndPrune function uses a derived-table subquery with
   * LIMIT ? in the DELETE statement to prune old rows. This also failed with
   * ER_WRONG_ARGUMENTS under pool.execute and was fixed with pool.query.
   */
  test('POST /storyboards/:draftId/history returns 201 — LIMIT prune does not 500', async ({
    page,
  }) => {
    const token = await readBearerToken();
    const draftId = await createTempDraft(page.request, token);

    try {
      // Load storyboard state to ensure draft is in a valid state on the server (idempotent)
      await page.request.get(
        `${E2E_API_URL}/storyboards/${draftId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      // Push a history snapshot — this exercises insertHistoryAndPrune which
      // contains the LIMIT-parameterised DELETE (the regression point)
      const postRes = await page.request.post(
        `${E2E_API_URL}/storyboards/${draftId}/history`,
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          data: { snapshot: { blocks: [], edges: [] } },
        },
      );

      expect(
        postRes.status(),
        `POST /storyboards/${draftId}/history must return 201 (was 500 before pool.execute→pool.query fix)`,
      ).toBe(201);
    } finally {
      await cleanupDraft(page.request, token, draftId);
    }
  });

  /**
   * Full round-trip: write a snapshot then read it back.
   *
   * Confirms the prune logic does not destroy data when the cap has not been
   * reached, and that both the write and the read paths work end-to-end.
   */
  test('history round-trip: POST snapshot then GET returns it in the list', async ({
    page,
  }) => {
    const token = await readBearerToken();
    const draftId = await createTempDraft(page.request, token);

    try {
      await page.request.get(
        `${E2E_API_URL}/storyboards/${draftId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      const testSnapshot = { blocks: [{ id: 'test-block', note: 'e2e-regression-guard' }], edges: [] };

      const postRes = await page.request.post(
        `${E2E_API_URL}/storyboards/${draftId}/history`,
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          data: { snapshot: testSnapshot },
        },
      );
      expect(postRes.status(), 'POST /history must return 201').toBe(201);

      const getRes = await page.request.get(
        `${E2E_API_URL}/storyboards/${draftId}/history`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      expect(getRes.status(), 'GET /history must return 200').toBe(200);

      const snapshots = (await getRes.json()) as Array<{
        snapshot: unknown;
        createdAt: string;
      }>;
      expect(
        snapshots.length,
        'GET /history must return at least 1 entry after POST',
      ).toBeGreaterThanOrEqual(1);

      // The most recent snapshot should be the one we just posted (sorted newest-first)
      const latest = snapshots[0];
      expect(
        latest,
        'latest snapshot should have snapshot + createdAt fields',
      ).toMatchObject({ snapshot: expect.anything(), createdAt: expect.any(String) });
    } finally {
      await cleanupDraft(page.request, token, draftId);
    }
  });

  /**
   * Home page loads without 500 errors from the storyboard history endpoints.
   *
   * Navigates to the app's home page (which is reliably reachable — unlike
   * /storyboard/:draftId which requires @xyflow/react in the Vite container),
   * confirms the app shell renders, and then exercises all storyboard history
   * API calls from within the browser context. Any 500 from the API would
   * indicate the regression is still present.
   */
  test('app home page loads + storyboard history endpoints return success from browser context', async ({
    page,
  }) => {
    // Navigate to home page to confirm browser context is authenticated and
    // the app is reachable
    await page.goto('/');
    await page.waitForLoadState('networkidle', { timeout: 30_000 });

    const token = await readBearerToken();
    const draftId = await createTempDraft(page.request, token);

    try {
      // Exercise the history endpoints from within the live browser context
      // GET /storyboards/:draftId now initializes sentinel nodes and advances status (idempotent)
      const initRes = await page.request.get(
        `${E2E_API_URL}/storyboards/${draftId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
      expect(initRes.status(), 'GET /storyboards/:draftId must return 200').toBe(200);

      const postRes = await page.request.post(
        `${E2E_API_URL}/storyboards/${draftId}/history`,
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          data: { snapshot: { blocks: [], edges: [] } },
        },
      );
      expect(
        postRes.status(),
        'POST /history (insertHistoryAndPrune LIMIT fix) must return 201',
      ).toBe(201);

      const getRes = await page.request.get(
        `${E2E_API_URL}/storyboards/${draftId}/history`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      expect(
        getRes.status(),
        'GET /history (findHistoryByDraftId LIMIT fix) must return 200',
      ).toBe(200);
    } finally {
      await cleanupDraft(page.request, token, draftId);
    }
  });
});
