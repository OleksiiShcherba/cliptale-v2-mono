/**
 * Shared helper functions for storyboard E2E tests.
 *
 * These helpers are extracted from storyboard-fixes.spec.ts so that new
 * storyboard test files can reuse them without duplicating 100+ lines of
 * boilerplate. Every helper is pure — no test framework imports (except
 * the Page type from @playwright/test for waitForCanvas).
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

import { AUTH_TOKEN_LOCAL_STORAGE_KEY } from './auth';
import { E2E_API_URL } from './env';

// ── Minimal APIRequestContext shape used by the helpers below ──────────────────
//
// Typed to accept page.request directly; each method signature matches the
// subset used here so that callers can pass page.request without casting.

type ApiPost = (
  url: string,
  opts: object,
) => Promise<{
  ok: () => boolean;
  json: () => Promise<unknown>;
  status: () => number;
  text: () => Promise<string>;
}>;

type ApiGet = (
  url: string,
  opts: object,
) => Promise<{
  ok: () => boolean;
  status: () => number;
  text: () => Promise<string>;
}>;

type ApiDelete = (url: string, opts: object) => Promise<unknown>;

type ApiContext = {
  post: ApiPost;
  get: ApiGet;
  delete: ApiDelete;
};

// ── readBearerToken ────────────────────────────────────────────────────────────

/**
 * Reads the bearer token from the storageState written by global-setup.
 * The FE injects this token into every apiClient request via localStorage.
 */
export async function readBearerToken(): Promise<string> {
  const statePath = path.resolve(
    __dirname,
    '../../test-results/e2e-auth-state.json',
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

// ── createTempDraft ────────────────────────────────────────────────────────────

/**
 * Creates a temporary generation draft and returns its id.
 * Uses page.request so the HTTP call bypasses browser CORS.
 */
export async function createTempDraft(
  apiContext: ApiContext,
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

// ── initializeDraft ────────────────────────────────────────────────────────────

/**
 * Loads the storyboard state, which also initializes sentinel nodes and
 * advances draft status (idempotent).
 */
export async function initializeDraft(
  apiContext: ApiContext,
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

// ── cleanupDraft ───────────────────────────────────────────────────────────────

/**
 * Soft-deletes the draft — best-effort cleanup in finally blocks.
 */
export async function cleanupDraft(
  apiContext: ApiContext,
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

// ── waitForCanvas ──────────────────────────────────────────────────────────────

/**
 * Waits for the storyboard canvas and React Flow to be fully loaded.
 * Extracted to avoid repeating the same await sequence in every test.
 */
export async function waitForCanvas(page: Page): Promise<void> {
  await expect(page.getByTestId('storyboard-canvas')).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.locator('.react-flow')).toBeVisible({ timeout: 15_000 });
  // START and END nodes must both be rendered before we interact with them.
  await expect(page.getByTestId('start-node')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('end-node')).toBeVisible({ timeout: 15_000 });
}
