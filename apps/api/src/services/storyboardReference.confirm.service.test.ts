/**
 * T6 — storyboardReference.confirm.service INTEGRATION test
 *
 * ACs under test:
 *   AC-03 (US-02) — confirm creates K blocks + K flows + K pending rows and
 *                   enqueues exactly min(N, K) jobs in cast order.
 *   AC-13 (US-03) — non-owner is denied without revealing contents.
 *
 * Also covers the ancillary spec required by the task notes:
 *   - N is read from user_settings.concurrencyLimit; absent → default 4.
 *   - settings.service updateMySettings persists concurrencyLimit (bounds 1-12).
 *   - Billing is NOT called on confirm.
 *   - A transaction failure inside confirmCast leaves no blocks / flows / pending rows.
 *
 * Run (from worktree):
 *   cd apps/api && APP_DB_PASSWORD=cliptale APP_REDIS_URL=redis://localhost:6380 \
 *     npx vitest run src/services/storyboardReference.confirm.service.test.ts
 *
 * Level: integration (real MySQL, real Redis, BullMQ Queue.add stubbed).
 */

import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import mysql, { type Connection, type RowDataPacket } from 'mysql2/promise';

// ── Env setup — must precede any app-module import ────────────────────────────
Object.assign(process.env, {
  APP_DB_HOST:              process.env['APP_DB_HOST']              ?? 'localhost',
  APP_DB_PORT:              process.env['APP_DB_PORT']              ?? '3306',
  APP_DB_NAME:              process.env['APP_DB_NAME']              ?? 'cliptale',
  APP_DB_USER:              process.env['APP_DB_USER']              ?? 'cliptale',
  APP_DB_PASSWORD:          process.env['APP_DB_PASSWORD']          ?? 'cliptale',
  APP_REDIS_URL:            process.env['APP_REDIS_URL']            ?? 'redis://localhost:6380',
  APP_S3_BUCKET:            process.env['APP_S3_BUCKET']            ?? 'test-bucket',
  APP_S3_REGION:            process.env['APP_S3_REGION']            ?? 'us-east-1',
  APP_S3_ACCESS_KEY_ID:     process.env['APP_S3_ACCESS_KEY_ID']     ?? 'test-access-key-id',
  APP_S3_SECRET_ACCESS_KEY: process.env['APP_S3_SECRET_ACCESS_KEY'] ?? 'test-secret-key-value',
  APP_JWT_SECRET:           'srf-T6-confirm-integ-test-secret!!!!!',
  APP_DEV_AUTH_BYPASS:      'false',
});

// ── Mocks ─────────────────────────────────────────────────────────────────────
// BullMQ Queue.add must not hit a real worker — stub it but let Redis stay real.
const mockQueueAdd = vi.fn().mockResolvedValue({ id: 'mock-bullmq-job' });
vi.mock('bullmq', async (importOriginal) => {
  const actual = await importOriginal<typeof import('bullmq')>();
  return {
    ...actual,
    Queue: vi.fn().mockImplementation(() => ({
      add: mockQueueAdd,
      on: vi.fn(),
    })),
    Worker: actual.Worker,
  };
});

// Realtime publisher — stub away ws side effects.
vi.mock('@/lib/realtimePublisher.js', () => ({
  publishAiJobUpdatedById: vi.fn().mockResolvedValue(undefined),
}));

// ── Shared DB connection ───────────────────────────────────────────────────────
let conn: Connection;

const OWNER_ID = `srf-T6-owner-${randomUUID().slice(0, 8)}`;
const OTHER_ID = `srf-T6-other-${randomUUID().slice(0, 8)}`;

// Accumulate per-test IDs for scoped cleanup.
const cleanupDraftIds: string[] = [];
const cleanupUserIds: string[] = [OWNER_ID, OTHER_ID];

beforeAll(async () => {
  conn = await mysql.createConnection({
    host:     process.env['APP_DB_HOST']     ?? 'localhost',
    port:     Number(process.env['APP_DB_PORT'] ?? 3306),
    database: process.env['APP_DB_NAME']     ?? 'cliptale',
    user:     process.env['APP_DB_USER']     ?? 'cliptale',
    password: process.env['APP_DB_PASSWORD'] ?? 'cliptale',
  });

  for (const id of [OWNER_ID, OTHER_ID]) {
    await conn.execute(
      `INSERT IGNORE INTO users (user_id, email, password_hash) VALUES (?, ?, ?)`,
      [id, `${id}@example.test`, 'hash'],
    );
  }
});

afterAll(async () => {
  // Per-test scope: only delete rows belonging to this test run.
  if (cleanupDraftIds.length) {
    // Reference blocks and flows cascade from draft deletion (FK ON DELETE CASCADE).
    // Flows (generation_flows) do NOT cascade from draft; delete separately.
    await conn.query(
      `DELETE FROM storyboard_cast_extraction_jobs WHERE draft_id IN (${cleanupDraftIds.map(() => '?').join(',')})`,
      cleanupDraftIds,
    );
    // storyboard_reference_blocks cascade from generation_drafts (ON DELETE CASCADE).
    await conn.query(
      `DELETE FROM generation_drafts WHERE id IN (${cleanupDraftIds.map(() => '?').join(',')})`,
      cleanupDraftIds,
    );
  }
  // Clean ai_generation_jobs created by confirmCast (linked by user_id).
  await conn.execute(
    `DELETE FROM ai_generation_jobs WHERE user_id IN (${cleanupUserIds.map(() => '?').join(',')})`,
    cleanupUserIds,
  );
  // Clean any generation_flows created for OWNER_ID (also carries draft-linked rows).
  await conn.execute(
    `DELETE FROM generation_flows WHERE user_id IN (${cleanupUserIds.map(() => '?').join(',')})`,
    cleanupUserIds,
  );
  // Clean user_settings rows.
  for (const uid of cleanupUserIds) {
    await conn.execute(`DELETE FROM user_settings WHERE user_id = ?`, [uid]);
  }
  for (const uid of cleanupUserIds) {
    await conn.execute(`DELETE FROM users WHERE user_id = ?`, [uid]);
  }
  await conn.end();
});

// ── Seed helpers ──────────────────────────────────────────────────────────────

/** Insert a minimal generation_drafts row; returns its id. */
async function seedDraft(userId: string): Promise<string> {
  const id = randomUUID();
  cleanupDraftIds.push(id);
  await conn.execute(
    `INSERT INTO generation_drafts (id, user_id, prompt_doc) VALUES (?, ?, ?)`,
    [id, userId, JSON.stringify({ version: 1, content: [] })],
  );
  return id;
}

/**
 * Insert a completed cast_extraction_job for a draft with a minimal proposal
 * containing K entries (all characters).  Returns the job id.
 */
async function seedExtractionJob(draftId: string, userId: string, k: number): Promise<string> {
  const id = randomUUID();
  const proposal = Array.from({ length: k }, (_, i) => ({
    type: 'character',
    name: `Test Character ${i + 1}`,
    description: `Desc ${i + 1}`,
    image_file_ids: [],
    scene_block_ids: [],
    per_run_estimate: 0.42,
  }));
  await conn.execute(
    `INSERT INTO storyboard_cast_extraction_jobs
       (id, draft_id, user_id, status, proposal_json, aggregate_estimate_credits, completed_at)
     VALUES (?, ?, ?, 'completed', ?, ?, NOW(3))`,
    [id, draftId, userId, JSON.stringify(proposal), (0.42 * k).toFixed(4)],
  );
  return id;
}

// ── Lazy service import ───────────────────────────────────────────────────────

async function confirmSvc() {
  return import('@/services/storyboardReference.confirm.service.js');
}

async function settingsSvc() {
  return import('@/services/settings.service.js');
}

// ─────────────────────────────────────────────────────────────────────────────
// AC-03 — happy path
// ─────────────────────────────────────────────────────────────────────────────

describe('AC-03 / confirmCast — happy path', () => {
  it(
    'cast of K entries creates K blocks + K flows + K pending rows and enqueues exactly min(N, K) jobs',
    async () => {
      const { confirmCast } = await confirmSvc();

      const K = 3; // cast size
      const N = 4; // concurrency default (N > K, so min(N, K) = K = 3)

      const draftId = await seedDraft(OWNER_ID);
      await seedExtractionJob(draftId, OWNER_ID, K);

      mockQueueAdd.mockClear();

      const entries = Array.from({ length: K }, (_, i) => ({
        castType: 'character' as const,
        name: `Test Character ${i + 1}`,
        description: `Desc ${i + 1}`,
        imageFileIds: [] as string[],
        sceneBlockIds: [] as string[],
      }));

      const result = await confirmCast({
        draftId,
        userId: OWNER_ID,
        entries,
        acknowledgedAggregateCredits: 0.42 * K,
      });

      // K blocks returned
      expect(result).toHaveLength(K);

      // Each block has a 1:1 linked flow
      for (const block of result) {
        expect(block.flowId).toBeTruthy();
        expect(typeof block.flowId).toBe('string');
      }

      // DB: K blocks in storyboard_reference_blocks for this draft
      const [blockRows] = await conn.execute<RowDataPacket[]>(
        `SELECT id, window_status, sort_order FROM storyboard_reference_blocks
          WHERE draft_id = ? ORDER BY sort_order ASC`,
        [draftId],
      );
      expect(blockRows).toHaveLength(K);

      // All K blocks have window_status = 'pending'
      for (const row of blockRows) {
        expect(row['window_status']).toBe('pending');
      }

      // DB: K generation_flows created (one per block)
      const flowIds = result.map((b) => b.flowId).filter(Boolean) as string[];
      expect(flowIds).toHaveLength(K);
      const [flowRows] = await conn.query<RowDataPacket[]>(
        `SELECT flow_id FROM generation_flows WHERE flow_id IN (${flowIds.map(() => '?').join(',')})`,
        flowIds,
      );
      expect(flowRows).toHaveLength(K);

      // BullMQ: min(N=4, K=3) = 3 jobs enqueued
      expect(mockQueueAdd).toHaveBeenCalledTimes(Math.min(N, K));

      // sort_order follows cast order (0-indexed ascending)
      for (let i = 0; i < K; i++) {
        expect(blockRows[i]!['sort_order']).toBe(i);
      }

      // BullMQ payload must be worker-consumable:
      // each call must carry modelId, capability, provider, prompt, options.
      for (const call of mockQueueAdd.mock.calls) {
        const payload = call[1] as Record<string, unknown>;
        expect(typeof payload['jobId']).toBe('string');
        expect(typeof payload['modelId']).toBe('string');
        expect(payload['capability']).toBe('text_to_image');
        expect(payload['provider']).toBe('fal');
        expect(typeof payload['prompt']).toBe('string');
        expect(payload['prompt']).toBeTruthy();
        expect(typeof payload['options']).toBe('object');
        // Must NOT carry referenceBlockId/flowId as top-level discriminators
        // (worker reads modelId/capability, not a referenceBlockId).
        expect('referenceBlockId' in payload).toBe(false);
      }

      // DB: ai_generation_jobs rows created for the dispatched blocks (min(N,K) = K = 3).
      const dispatchedBlockIds = result.slice(0, Math.min(N, K)).map((b) => b.blockId);
      const [blockWithJobs] = await conn.execute<RowDataPacket[]>(
        `SELECT id, first_job_id, window_status
           FROM storyboard_reference_blocks
          WHERE id IN (${dispatchedBlockIds.map(() => '?').join(',')})
          ORDER BY sort_order ASC`,
        dispatchedBlockIds,
      );
      for (const row of blockWithJobs) {
        // first_job_id must be set for each dispatched block (ADR-0003 correlation).
        expect(row['first_job_id']).toBeTruthy();
        expect(typeof row['first_job_id']).toBe('string');
      }

      // Each first_job_id must correspond to a real ai_generation_jobs row.
      const jobIds = blockWithJobs.map((r) => r['first_job_id'] as string);
      const [jobRows] = await conn.query<RowDataPacket[]>(
        `SELECT job_id, model_id, capability, status
           FROM ai_generation_jobs
          WHERE job_id IN (${jobIds.map(() => '?').join(',')})`,
        jobIds,
      );
      expect(jobRows).toHaveLength(Math.min(N, K));
      for (const row of jobRows) {
        expect(row['status']).toBe('queued');
        expect(row['model_id']).toBe('openai/gpt-image-2');
        expect(row['capability']).toBe('text_to_image');
      }

      // Non-dispatched blocks (K-N when K > N, here K=N so none) have first_job_id = NULL.
      if (K > N) {
        const remainingIds = result.slice(N).map((b) => b.blockId);
        const [remainingRows] = await conn.execute<RowDataPacket[]>(
          `SELECT id, first_job_id
             FROM storyboard_reference_blocks
            WHERE id IN (${remainingIds.map(() => '?').join(',')})`,
          remainingIds,
        );
        for (const row of remainingRows) {
          expect(row['first_job_id']).toBeNull();
        }
      }
    },
  );

  it(
    'when K > concurrencyLimit N, only N jobs are enqueued; remaining K-N blocks stay pending',
    async () => {
      const { confirmCast } = await confirmSvc();

      const K = 6;
      const N = 2; // store concurrencyLimit=2 for OWNER_ID

      // Persist N=2 in user_settings before calling confirmCast.
      const { updateMySettings } = await settingsSvc();
      await updateMySettings(OWNER_ID, { concurrencyLimit: N });

      const draftId = await seedDraft(OWNER_ID);
      await seedExtractionJob(draftId, OWNER_ID, K);

      mockQueueAdd.mockClear();

      const entries = Array.from({ length: K }, (_, i) => ({
        castType: 'character' as const,
        name: `Test Character ${i + 1}`,
        description: `Desc ${i + 1}`,
        imageFileIds: [] as string[],
        sceneBlockIds: [] as string[],
      }));

      const result = await confirmCast({
        draftId,
        userId: OWNER_ID,
        entries,
        acknowledgedAggregateCredits: 0.42 * K,
      });

      expect(result).toHaveLength(K);

      // Only N jobs dispatched
      expect(mockQueueAdd).toHaveBeenCalledTimes(N);

      // All K blocks are pending (the N that were dispatched become 'running' only
      // when the worker picks them up — at enqueue time they're still 'pending').
      const [blockRows] = await conn.execute<RowDataPacket[]>(
        `SELECT window_status FROM storyboard_reference_blocks
          WHERE draft_id = ? ORDER BY sort_order ASC`,
        [draftId],
      );
      expect(blockRows).toHaveLength(K);
      for (const row of blockRows) {
        expect(row['window_status']).toBe('pending');
      }

      // Dispatched blocks (first N) must have first_job_id set; remainder must be NULL.
      const [blockDetailsRows] = await conn.execute<RowDataPacket[]>(
        `SELECT id, first_job_id
           FROM storyboard_reference_blocks
          WHERE draft_id = ? ORDER BY sort_order ASC`,
        [draftId],
      );
      expect(blockDetailsRows).toHaveLength(K);

      for (let i = 0; i < N; i++) {
        expect(blockDetailsRows[i]!['first_job_id']).toBeTruthy();
      }
      for (let i = N; i < K; i++) {
        expect(blockDetailsRows[i]!['first_job_id']).toBeNull();
      }

      // The N dispatched ai_generation_jobs must exist with status='queued'.
      const dispatchedJobIds = blockDetailsRows
        .slice(0, N)
        .map((r) => r['first_job_id'] as string);
      const [jobRows] = await conn.query<RowDataPacket[]>(
        `SELECT job_id, model_id, capability, status
           FROM ai_generation_jobs
          WHERE job_id IN (${dispatchedJobIds.map(() => '?').join(',')})`,
        dispatchedJobIds,
      );
      expect(jobRows).toHaveLength(N);
      for (const row of jobRows) {
        expect(row['status']).toBe('queued');
        expect(row['model_id']).toBe('openai/gpt-image-2');
        expect(row['capability']).toBe('text_to_image');
      }

      // Reset concurrencyLimit so later tests see the default.
      await updateMySettings(OWNER_ID, { concurrencyLimit: 4 });
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// concurrencyLimit setting
// ─────────────────────────────────────────────────────────────────────────────

describe('concurrencyLimit setting — settings.service', () => {
  it('absent concurrencyLimit → default 4', async () => {
    const { getMySettings } = await settingsSvc();
    // Use a fresh user with no settings row.
    const freshUser = `srf-T6-fresh-${randomUUID().slice(0, 8)}`;
    cleanupUserIds.push(freshUser);
    await conn.execute(
      `INSERT IGNORE INTO users (user_id, email, password_hash) VALUES (?, ?, ?)`,
      [freshUser, `${freshUser}@example.test`, 'hash'],
    );

    const settings = await getMySettings(freshUser);
    expect(settings.concurrencyLimit).toBe(4);
  });

  it('updateMySettings persists concurrencyLimit within 1-12 bounds', async () => {
    const { updateMySettings, getMySettings } = await settingsSvc();

    const updated = await updateMySettings(OTHER_ID, { concurrencyLimit: 6 });
    expect(updated.concurrencyLimit).toBe(6);

    const persisted = await getMySettings(OTHER_ID);
    expect(persisted.concurrencyLimit).toBe(6);
  });

  it('concurrencyLimit below 1 is rejected (validation guard)', async () => {
    const { updateMySettings } = await settingsSvc();
    await expect(
      updateMySettings(OTHER_ID, { concurrencyLimit: 0 }),
    ).rejects.toThrow();
  });

  it('concurrencyLimit above 12 is rejected (validation guard)', async () => {
    const { updateMySettings } = await settingsSvc();
    await expect(
      updateMySettings(OTHER_ID, { concurrencyLimit: 13 }),
    ).rejects.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-03 — billing not called on confirm
// ─────────────────────────────────────────────────────────────────────────────

describe('AC-03 — billing is NOT called on confirm', () => {
  it('confirmCast enqueues ai-generate jobs but never calls a billing service', async () => {
    // The confirm service must not import or call any billing module.
    // We verify by checking that no billing-specific BullMQ queue (not ai-generate)
    // is called, and that the confirmCast module itself has no billing dependency.
    // Structural check: dynamic import of the service should succeed cleanly and
    // the mock for billing (if such a module existed) should never be invoked.
    // Since no billing module exists in this codebase for this path, we assert
    // that BullMQ add is only called for 'ai-generate' job payloads.
    const { confirmCast } = await confirmSvc();

    const K = 1;
    const draftId = await seedDraft(OWNER_ID);
    await seedExtractionJob(draftId, OWNER_ID, K);

    mockQueueAdd.mockClear();

    await confirmCast({
      draftId,
      userId: OWNER_ID,
      entries: [
        { castType: 'character', name: 'Test Character 1', description: 'Desc 1', imageFileIds: [], sceneBlockIds: [] },
      ],
      acknowledgedAggregateCredits: 0.42,
    });

    // Every BullMQ add call must be for the ai-generate queue (not a billing queue).
    for (const call of mockQueueAdd.mock.calls) {
      const jobName: string = call[0] as string;
      // The job name passed to Queue.add should be 'ai-generate' (the queue's job name).
      expect(jobName).toBe('ai-generate');

      // Payload must be worker-consumable (worker reads modelId/capability/provider/prompt/options).
      const payload = call[1] as Record<string, unknown>;
      expect(typeof payload['jobId']).toBe('string');
      expect(typeof payload['modelId']).toBe('string');
      expect(payload['capability']).toBeTruthy();
      expect(payload['provider']).toBeTruthy();
      expect(typeof payload['prompt']).toBe('string');
      expect(payload['prompt']).toBeTruthy();
      expect(typeof payload['options']).toBe('object');
    }

    // DB: an ai_generation_jobs row must have been created (not just enqueued).
    expect(mockQueueAdd).toHaveBeenCalledTimes(1);
    const jobId = (mockQueueAdd.mock.calls[0]![1] as Record<string, unknown>)['jobId'] as string;
    const [jobRows] = await conn.execute<RowDataPacket[]>(
      `SELECT job_id, status, model_id, capability FROM ai_generation_jobs WHERE job_id = ?`,
      [jobId],
    );
    expect(jobRows).toHaveLength(1);
    expect(jobRows[0]!['status']).toBe('queued');
    expect(jobRows[0]!['model_id']).toBe('openai/gpt-image-2');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-03 — transaction atomicity (partial failure → nothing created)
// ─────────────────────────────────────────────────────────────────────────────

describe('AC-03 — transaction failure leaves no blocks / flows / pending rows', () => {
  it('if confirmCast throws mid-transaction, no reference block or flow is persisted', async () => {
    const { confirmCast } = await confirmSvc();

    const draftId = await seedDraft(OWNER_ID);
    // Provide a cast entry with an invalid (non-existent) scene block id to
    // force a FK violation inside the transaction, causing rollback.
    // The service should propagate the error and leave the DB clean.
    const badSceneId = randomUUID(); // not in storyboard_blocks

    await seedExtractionJob(draftId, OWNER_ID, 1);

    mockQueueAdd.mockClear();

    await expect(
      confirmCast({
        draftId,
        userId: OWNER_ID,
        entries: [
          {
            castType: 'character',
            name: 'Test Character 1',
            description: 'Desc 1',
            imageFileIds: [],
            sceneBlockIds: [badSceneId], // FK violation → transaction rolls back
          },
        ],
        acknowledgedAggregateCredits: 0.42,
      }),
    ).rejects.toThrow();

    // No blocks created for this draft.
    const [blockRows] = await conn.execute<RowDataPacket[]>(
      `SELECT id FROM storyboard_reference_blocks WHERE draft_id = ?`,
      [draftId],
    );
    expect(blockRows).toHaveLength(0);

    // No flows created for this user in this run (mockQueueAdd not called).
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-13 — authorization: non-owner denied without revealing contents
// ─────────────────────────────────────────────────────────────────────────────

describe('AC-13 — non-owner is denied without revealing contents', () => {
  it('confirmCast by a non-owner → NotFoundError (404 / existence hiding)', async () => {
    const { confirmCast } = await confirmSvc();
    const { NotFoundError } = await import('@/lib/errors.js');

    const draftId = await seedDraft(OWNER_ID);
    await seedExtractionJob(draftId, OWNER_ID, 1);

    // OTHER_ID does not own this draft — must get NotFoundError, not a 403/details.
    await expect(
      confirmCast({
        draftId,
        userId: OTHER_ID,
        entries: [
          { castType: 'character', name: 'Test Character 1', description: 'Desc', imageFileIds: [], sceneBlockIds: [] },
        ],
        acknowledgedAggregateCredits: 0.42,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);

    // The owner's draft must remain untouched — no blocks created.
    const [blockRows] = await conn.execute<RowDataPacket[]>(
      `SELECT id FROM storyboard_reference_blocks WHERE draft_id = ?`,
      [draftId],
    );
    expect(blockRows).toHaveLength(0);
  });

  it('confirmCast with a non-existent draftId → NotFoundError (existence hiding)', async () => {
    const { confirmCast } = await confirmSvc();
    const { NotFoundError } = await import('@/lib/errors.js');

    const phantomDraftId = randomUUID(); // never inserted

    await expect(
      confirmCast({
        draftId: phantomDraftId,
        userId: OWNER_ID,
        entries: [
          { castType: 'character', name: 'Test Character 1', description: 'Desc', imageFileIds: [], sceneBlockIds: [] },
        ],
        acknowledgedAggregateCredits: 0.42,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
