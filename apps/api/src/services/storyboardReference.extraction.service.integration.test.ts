/**
 * Integration tests for storyboardReference.extraction.service.ts — idempotent start (QG-3).
 *
 * Proves ADR-0001's "one cast extraction per draft" invariant against the REAL MySQL
 * datastore (not just the unit seam): a duplicate startExtraction converges on the existing
 * row, while a failed latest is treated as not-existing and a fresh start is allowed.
 *
 * Covers:
 *   AC-05 / QG-3 — second startExtraction returns the first job's id; row count for the draft == 1
 *                  (queued / running / completed latest are each returned idempotently).
 *   AC-07        — a `failed` latest triggers a fresh `queued` job (recovery path).
 *
 * Test level: integration (real MySQL via @/db/connection pool; only the BullMQ enqueue is
 * mocked so no Redis is required — the repository layer is never mocked, per data-model.md).
 *
 * Run:
 *   APP_DB_PASSWORD=cliptale vitest run src/services/storyboardReference.extraction.service.integration.test.ts
 */
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import mysql, { type Connection } from 'mysql2/promise';

// ── Set env vars before any app module is imported ────────────────────────────
Object.assign(process.env, {
  APP_DB_HOST:              process.env['APP_DB_HOST']              ?? 'localhost',
  APP_DB_PORT:              process.env['APP_DB_PORT']              ?? '3306',
  APP_DB_NAME:              process.env['APP_DB_NAME']              ?? 'cliptale',
  APP_DB_USER:              process.env['APP_DB_USER']              ?? 'cliptale',
  APP_DB_PASSWORD:          process.env['APP_DB_PASSWORD']          ?? 'cliptale',
  APP_REDIS_URL:            process.env['APP_REDIS_URL']            ?? 'redis://localhost:6379',
  APP_S3_BUCKET:            process.env['APP_S3_BUCKET']            ?? 'test-bucket',
  APP_S3_REGION:            process.env['APP_S3_REGION']            ?? 'us-east-1',
  APP_S3_ACCESS_KEY_ID:     process.env['APP_S3_ACCESS_KEY_ID']     ?? 'test-access-key-id',
  APP_S3_SECRET_ACCESS_KEY: process.env['APP_S3_SECRET_ACCESS_KEY'] ?? 'test-secret-key-value',
  APP_JWT_SECRET:           'cast-extract-int-test-secret-32chars!!',
  APP_DEV_AUTH_BYPASS:      'false',
});

// Only the queue is mocked — keep the repository layer on real MySQL (data-model.md).
vi.mock('@/queues/jobs/enqueue-cast-extract.js', () => ({
  enqueueCastExtract: vi.fn().mockResolvedValue(undefined),
}));

// ─────────────────────────────────────────────────────────────────────────────

let conn: Connection;
let startExtraction: typeof import('./storyboardReference.extraction.service.js').startExtraction;

const INT_USER = `cast-int-${randomUUID().slice(0, 8)}`;
const cleanupDrafts: string[] = [];

/** Count cast-extraction job rows for a draft (the invariant under test). */
async function jobCount(draftId: string): Promise<number> {
  const [rows] = await conn.query<mysql.RowDataPacket[]>(
    'SELECT COUNT(*) AS n FROM storyboard_cast_extraction_jobs WHERE draft_id = ?',
    [draftId],
  );
  return Number(rows[0]!['n']);
}

/** Seed a fresh draft owned by INT_USER and register it for cleanup. */
async function seedDraft(): Promise<string> {
  const draftId = randomUUID();
  await conn.execute(
    'INSERT INTO generation_drafts (id, user_id, prompt_doc) VALUES (?, ?, ?)',
    [draftId, INT_USER, JSON.stringify({ blocks: [] })],
  );
  cleanupDrafts.push(draftId);
  return draftId;
}

/** Insert a cast-extraction job row directly in a given status (seeds a "latest" state). */
async function seedJob(draftId: string, status: 'queued' | 'running' | 'completed' | 'failed'): Promise<string> {
  const jobId = randomUUID();
  await conn.execute(
    'INSERT INTO storyboard_cast_extraction_jobs (id, draft_id, user_id, status) VALUES (?, ?, ?, ?)',
    [jobId, draftId, INT_USER, status],
  );
  return jobId;
}

beforeAll(async () => {
  conn = await mysql.createConnection({
    host:     process.env['APP_DB_HOST']     ?? 'localhost',
    port:     Number(process.env['APP_DB_PORT'] ?? 3306),
    database: process.env['APP_DB_NAME']     ?? 'cliptale',
    user:     process.env['APP_DB_USER']     ?? 'cliptale',
    password: process.env['APP_DB_PASSWORD'] ?? 'cliptale',
  });

  // PII guard: seeded owner uses user-<uuid>@example.test (data-model.md §Test fixtures).
  await conn.execute(
    `INSERT INTO users (user_id, email, display_name, email_verified)
     VALUES (?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE user_id = user_id`,
    [INT_USER, `user-${randomUUID()}@example.test`, INT_USER],
  );

  ({ startExtraction } = await import('./storyboardReference.extraction.service.js'));
});

afterAll(async () => {
  if (cleanupDrafts.length) {
    const ph = cleanupDrafts.map(() => '?').join(',');
    // cast-extraction rows cascade on draft delete (fk ON DELETE CASCADE), but clear explicitly.
    await conn.query(`DELETE FROM storyboard_cast_extraction_jobs WHERE draft_id IN (${ph})`, cleanupDrafts);
    await conn.query(`DELETE FROM generation_drafts WHERE id IN (${ph})`, cleanupDrafts);
  }
  await conn.query('DELETE FROM users WHERE user_id = ?', [INT_USER]);
  await conn.end();
});

describe('startExtraction — idempotent per draft against real MySQL (QG-3)', () => {
  it('a duplicate call returns the first job id and leaves exactly one row (AC-05)', async () => {
    const draftId = await seedDraft();

    const first = await startExtraction(INT_USER, draftId);
    expect(first.status).toBe('queued');
    expect(await jobCount(draftId)).toBe(1);

    const second = await startExtraction(INT_USER, draftId);

    expect(second.jobId).toBe(first.jobId);
    expect(await jobCount(draftId)).toBe(1); // the invariant — no second row inserted
  });

  it.each(['running', 'completed'] as const)(
    'returns the existing %s job idempotently without inserting a new row (AC-05)',
    async (status) => {
      const draftId = await seedDraft();
      const seededJobId = await seedJob(draftId, status);

      const result = await startExtraction(INT_USER, draftId);

      expect(result.jobId).toBe(seededJobId);
      expect(result.status).toBe(status);
      expect(await jobCount(draftId)).toBe(1);
    },
  );

  it('creates a fresh queued job when the latest job is failed (AC-07)', async () => {
    const draftId = await seedDraft();
    const failedJobId = await seedJob(draftId, 'failed');

    const result = await startExtraction(INT_USER, draftId);

    expect(result.status).toBe('queued');
    expect(result.jobId).not.toBe(failedJobId);
    expect(await jobCount(draftId)).toBe(2); // failed + fresh queued
  });
});
