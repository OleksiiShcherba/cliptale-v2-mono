/**
 * enqueueCastExtraction.integration.test.ts — B1 review fix (AC-02), real MySQL.
 *
 * Verifies the worker-side cast-extraction enqueue: it creates a queued
 * storyboard_cast_extraction_jobs row + adds a 'cast-extract' job to the queue, and is
 * idempotent (a non-failed existing job is reused, never duplicated). This is the link
 * that was MISSING — without it reference_data sat `running` until the reaper failed it
 * and the cast-proposal modal (AC-02) was never reached.
 */
import { randomUUID } from 'node:crypto';

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

import { pool } from '@/lib/db.js';
import {
  enqueueCastExtraction,
  CAST_EXTRACT_JOB_NAME,
} from '@/jobs/enqueueCastExtraction.js';

const PREFIX = 'sgp-b1';
const ctx: { userId: string; draftIds: string[] } = { userId: '', draftIds: [] };

async function seedDraft(): Promise<string> {
  const draftId = randomUUID();
  ctx.draftIds.push(draftId);
  await pool.execute(
    `INSERT INTO generation_drafts (id, user_id, prompt_doc, status)
     VALUES (?, ?, CAST('{}' AS JSON), 'step2')`,
    [draftId, ctx.userId],
  );
  return draftId;
}

async function countJobs(draftId: string): Promise<number> {
  const [rows] = await pool.execute<Array<{ cnt: number }>>(
    `SELECT COUNT(*) AS cnt FROM storyboard_cast_extraction_jobs WHERE draft_id = ?`,
    [draftId],
  );
  return Number(rows[0]!.cnt);
}

beforeAll(async () => {
  ctx.userId = randomUUID();
  await pool.execute(
    `INSERT INTO users (user_id, email, display_name, email_verified) VALUES (?, ?, ?, 1)`,
    [ctx.userId, `${PREFIX}-${ctx.userId}@example.test`, 'B1 Tester'],
  );
});

afterAll(async () => {
  for (const draftId of ctx.draftIds) {
    await pool.execute(`DELETE FROM storyboard_cast_extraction_jobs WHERE draft_id = ?`, [draftId]);
    await pool.execute(`DELETE FROM generation_drafts WHERE id = ?`, [draftId]);
  }
  await pool.execute(`DELETE FROM users WHERE user_id = ?`, [ctx.userId]);
  await pool.end();
});

describe('B1 — enqueueCastExtraction (AC-02 chain)', () => {
  it('creates a queued cast-extraction job row AND enqueues a cast-extract job', async () => {
    const draftId = await seedDraft();
    const add = vi.fn().mockResolvedValue(undefined);

    const result = await enqueueCastExtraction(
      { draftId, userId: ctx.userId },
      { pool, queue: { add } },
    );

    expect(result.enqueued).toBe(true);
    expect(await countJobs(draftId)).toBe(1);

    // The row is 'queued' with the returned id.
    const [rows] = await pool.execute<Array<{ status: string }>>(
      `SELECT status FROM storyboard_cast_extraction_jobs WHERE id = ?`,
      [result.jobId],
    );
    expect(rows[0]!.status).toBe('queued');

    // Enqueued under the correct name + payload, jobId = DB job id (idempotency key).
    expect(add).toHaveBeenCalledTimes(1);
    const [name, payload, opts] = add.mock.calls[0]!;
    expect(name).toBe(CAST_EXTRACT_JOB_NAME);
    expect(payload).toMatchObject({ jobId: result.jobId, draftId, userId: ctx.userId });
    expect(opts).toMatchObject({ jobId: result.jobId });
  });

  it('is idempotent: a non-failed existing job is REUSED, not duplicated', async () => {
    const draftId = await seedDraft();
    const add = vi.fn().mockResolvedValue(undefined);

    const first = await enqueueCastExtraction({ draftId, userId: ctx.userId }, { pool, queue: { add } });
    expect(first.enqueued).toBe(true);

    // Second call (e.g. a redelivered scene job) must NOT create a second row.
    const second = await enqueueCastExtraction({ draftId, userId: ctx.userId }, { pool, queue: { add } });
    expect(second.enqueued).toBe(false);
    expect(second.jobId).toBe(first.jobId); // reused
    expect(await countJobs(draftId)).toBe(1); // still exactly one
    expect(add).toHaveBeenCalledTimes(1); // no second enqueue
  });

  it('a FAILED existing job does not block a fresh enqueue', async () => {
    const draftId = await seedDraft();
    // Pre-existing failed extraction.
    await pool.execute(
      `INSERT INTO storyboard_cast_extraction_jobs (id, draft_id, user_id, status, failed_at)
       VALUES (?, ?, ?, 'failed', NOW(3))`,
      [randomUUID(), draftId, ctx.userId],
    );
    const add = vi.fn().mockResolvedValue(undefined);

    const result = await enqueueCastExtraction({ draftId, userId: ctx.userId }, { pool, queue: { add } });
    expect(result.enqueued).toBe(true);
    expect(add).toHaveBeenCalledTimes(1);
    expect(await countJobs(draftId)).toBe(2); // failed + new
  });
});
