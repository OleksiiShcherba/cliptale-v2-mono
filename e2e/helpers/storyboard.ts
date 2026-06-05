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
import { randomUUID } from 'node:crypto';

import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import mysql from 'mysql2/promise';
import type { Connection, RowDataPacket } from 'mysql2/promise';

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
  json: () => Promise<unknown>;
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
    '../../.e2e-cache/e2e-auth-state.json',
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

// ── readAuthenticatedUserId ──────────────────────────────────────────────────

/**
 * Reads the authenticated user's id through the real API.
 * Uses page.request so the call bypasses browser CORS.
 */
export async function readAuthenticatedUserId(
  apiContext: ApiContext,
  token: string,
): Promise<string> {
  const res = await apiContext.get(`${E2E_API_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`GET /auth/me failed (${res.status()}): ${body}`);
  }
  const data = (await res.json()) as { userId?: string };
  if (!data.userId) throw new Error('GET /auth/me response missing userId');
  return data.userId;
}

// ── DB helpers for local E2E seeding ──────────────────────────────────────────

export type StoryboardPlanSeed = {
  schemaVersion: 1;
  videoLengthSeconds: number;
  sceneCount: number;
  scenes: Array<{
    sceneNumber: number;
    prompt: string;
    visualPrompt: string;
    durationSeconds: number;
    referencedMedia: Array<{
      fileId: string;
      mediaType: 'video' | 'image' | 'audio';
      label: string;
    }>;
    transitionNotes: string;
    style: string;
  }>;
};

export async function createE2eDbConnection(): Promise<Connection> {
  return mysql.createConnection({
    host: process.env['APP_DB_HOST'] ?? 'localhost',
    port: Number(process.env['APP_DB_PORT'] ?? 3306),
    database: process.env['APP_DB_NAME'] ?? 'cliptale',
    user: process.env['APP_DB_USER'] ?? 'cliptale',
    password: process.env['APP_DB_PASSWORD'] ?? 'cliptale',
  });
}

export async function seedCompletedStoryboardPlanJob(
  conn: Connection,
  params: {
    draftId: string;
    userId: string;
    plan: StoryboardPlanSeed;
    jobId?: string;
  },
): Promise<string> {
  const jobId = params.jobId ?? randomUUID();
  await conn.execute(
    `INSERT INTO storyboard_plan_jobs
       (job_id, draft_id, user_id, status, model, prompt_snapshot_json,
        media_context_json, plan_json, error_message, completed_at, failed_at)
     VALUES (?, ?, ?, 'completed', 'e2e-storyboard-plan', ?, NULL, ?, NULL, NOW(3), NULL)`,
    [
      jobId,
      params.draftId,
      params.userId,
      JSON.stringify({ schemaVersion: 1, blocks: [{ type: 'text', value: 'E2E storyboard plan' }] }),
      JSON.stringify(params.plan),
    ],
  );
  return jobId;
}

export async function deleteStoryboardPlanJob(
  conn: Connection,
  jobId: string,
): Promise<void> {
  await conn.execute('DELETE FROM storyboard_plan_jobs WHERE job_id = ?', [jobId]);
}

export async function readStoryboardGraphFromDb(
  conn: Connection,
  draftId: string,
): Promise<{
  blocks: Array<{ id: string; blockType: string; name: string | null; sortOrder: number }>;
  edges: Array<{ sourceBlockId: string; targetBlockId: string }>;
}> {
  const [blocks] = await conn.execute<RowDataPacket[]>(
    `SELECT id, block_type AS blockType, name, sort_order AS sortOrder
       FROM storyboard_blocks
      WHERE draft_id = ?
      ORDER BY sort_order ASC`,
    [draftId],
  );
  const [edges] = await conn.execute<RowDataPacket[]>(
    `SELECT source_block_id AS sourceBlockId, target_block_id AS targetBlockId
       FROM storyboard_edges
      WHERE draft_id = ?`,
    [draftId],
  );
  return {
    blocks: blocks.map((row) => ({
      id: String(row['id']),
      blockType: String(row['blockType']),
      name: row['name'] === null ? null : String(row['name']),
      sortOrder: Number(row['sortOrder']),
    })),
    edges: edges.map((row) => ({
      sourceBlockId: String(row['sourceBlockId']),
      targetBlockId: String(row['targetBlockId']),
    })),
  };
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
